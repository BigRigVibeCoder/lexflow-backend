/**
 * @file src/routes/trust-accounts.test.ts
 * @description Tests for trust account and client ledger routes.
 *
 * Uses Drizzle-compatible mock pool (array row mode) to exercise route
 * handler code behind requirePool().
 *
 * REF: GOV-002 (Testing Protocol)
 * REF: CON-002 §2
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../server.js';
import {
  createDrizzleMockPool,
  trustAccountArrayRow,
  clientLedgerArrayRow,
  balanceRow,
} from '../test-helpers/drizzle-mock-pool.js';

const originalNodeEnv = process.env['NODE_ENV'];

beforeAll(() => { process.env['NODE_ENV'] = 'development'; });
afterAll(() => { process.env['NODE_ENV'] = originalNodeEnv; });

const VALID_UUID = '10000000-0000-0000-0000-000000000001';


/* ═══════════════════════════════════════════════════════════════════════
 * POST /api/trust/accounts — Create Trust Account (CON-002 §2.1)
 * ═══════════════════════════════════════════════════════════════════ */

describe('POST /api/trust/accounts', () => {
  it('should reject empty body', async () => {
    const server = await buildServer({ pool: null, logLevel: 'silent' });
    const res = await server.inject({ method: 'POST', url: '/api/trust/accounts', payload: {} });
    expect(res.statusCode).toBe(400);
    await server.close();
  });

  it('should reject missing required fields', async () => {
    const server = await buildServer({ pool: null, logLevel: 'silent' });
    const res = await server.inject({
      method: 'POST', url: '/api/trust/accounts',
      payload: { bankName: 'Test Bank' },
    });
    expect(res.statusCode).toBe(400);
    await server.close();
  });

  it('should return 500 when pool is null', async () => {
    const server = await buildServer({ pool: null, logLevel: 'silent' });
    const res = await server.inject({
      method: 'POST', url: '/api/trust/accounts',
      payload: {
        bankName: 'Test Bank', accountNumber: '1234567890',
        routingNumber: '021000021', accountName: 'Client Trust',
        accountType: 'iolta',
      },
    });
    expect(res.statusCode).toBe(500);
    await server.close();
  });

  it('should create account with valid pool and body', async () => {
    const { pool } = createDrizzleMockPool([
      { rows: [trustAccountArrayRow()], rowCount: 1 },  // INSERT returning
    ]);
    const server = await buildServer({ pool, logLevel: 'silent' });

    const res = await server.inject({
      method: 'POST', url: '/api/trust/accounts',
      payload: {
        bankName: 'Test Bank', accountNumber: '1234567890',
        routingNumber: '021000021', accountName: 'Client Trust',
        accountType: 'iolta',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body).toHaveProperty('id');
    expect(body).toHaveProperty('bankName');
    expect(body).toHaveProperty('balance', '0.00');
    expect(body).toHaveProperty('createdAt');
    await server.close();
  });
});

/* ═══════════════════════════════════════════════════════════════════════
 * GET /api/trust/accounts — List Accounts (CON-002 §2.2)
 * ═══════════════════════════════════════════════════════════════════ */

describe('GET /api/trust/accounts', () => {
  it('should return 500 when pool is null', async () => {
    const server = await buildServer({ pool: null, logLevel: 'silent' });
    const res = await server.inject({ method: 'GET', url: '/api/trust/accounts' });
    expect(res.statusCode).toBe(500);
    await server.close();
  });

  it('should return empty list', async () => {
    const { pool } = createDrizzleMockPool([
      { rows: [], rowCount: 0 },  // SELECT accounts (empty)
    ]);
    const server = await buildServer({ pool, logLevel: 'silent' });
    const res = await server.inject({ method: 'GET', url: '/api/trust/accounts' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toHaveLength(0);
    await server.close();
  });

  it('should list accounts with balances', async () => {
    const { pool } = createDrizzleMockPool([
      { rows: [trustAccountArrayRow()], rowCount: 1 },  // SELECT accounts
      balanceRow('5000.00'),                              // getAccountBalance via client.query
      { rows: [[3]], rowCount: 1 },                      // COUNT ledgers (Drizzle array)
    ]);
    const server = await buildServer({ pool, logLevel: 'silent' });

    const res = await server.inject({ method: 'GET', url: '/api/trust/accounts' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].balance).toBe('5000.00');
    await server.close();
  });
});

/* ═══════════════════════════════════════════════════════════════════════
 * GET /api/trust/accounts/:id — Get Account (CON-002 §2.3)
 * ═══════════════════════════════════════════════════════════════════ */

describe('GET /api/trust/accounts/:id', () => {
  it('should reject non-UUID id', async () => {
    const server = await buildServer({ pool: null, logLevel: 'silent' });
    const res = await server.inject({ method: 'GET', url: '/api/trust/accounts/not-a-uuid' });
    expect(res.statusCode).toBe(400);
    await server.close();
  });

  it('should return 500 when pool is null with valid UUID', async () => {
    const server = await buildServer({ pool: null, logLevel: 'silent' });
    const res = await server.inject({ method: 'GET', url: `/api/trust/accounts/${VALID_UUID}` });
    expect(res.statusCode).toBe(500);
    await server.close();
  });

  it('should return 404 for non-existent account', async () => {
    const { pool } = createDrizzleMockPool([
      { rows: [], rowCount: 0 },  // SELECT returns empty
    ]);
    const server = await buildServer({ pool, logLevel: 'silent' });
    const res = await server.inject({ method: 'GET', url: `/api/trust/accounts/${VALID_UUID}` });
    expect(res.statusCode).toBe(404);
    await server.close();
  });

  it('should return account with balance and ledger count', async () => {
    const { pool } = createDrizzleMockPool([
      { rows: [trustAccountArrayRow()], rowCount: 1 },  // SELECT account
      balanceRow('10000.00'),                             // getAccountBalance
      { rows: [[5]], rowCount: 1 },                      // COUNT ledgers
    ]);
    const server = await buildServer({ pool, logLevel: 'silent' });
    const res = await server.inject({ method: 'GET', url: `/api/trust/accounts/${VALID_UUID}` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.balance).toBe('10000.00');
    expect(body.ledgerCount).toBe(5);
    await server.close();
  });
});

/* ═══════════════════════════════════════════════════════════════════════
 * POST /api/trust/accounts/:id/ledgers — Create Client Ledger (CON-002 §2.4)
 * ═══════════════════════════════════════════════════════════════════ */

describe('POST /api/trust/accounts/:id/ledgers', () => {
  it('should reject empty body', async () => {
    const server = await buildServer({ pool: null, logLevel: 'silent' });
    const res = await server.inject({
      method: 'POST', url: `/api/trust/accounts/${VALID_UUID}/ledgers`,
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    await server.close();
  });

  it('should return 500 when pool is null with valid body', async () => {
    const server = await buildServer({ pool: null, logLevel: 'silent' });
    const res = await server.inject({
      method: 'POST', url: `/api/trust/accounts/${VALID_UUID}/ledgers`,
      payload: {
        matterId: '30000000-0000-0000-0000-000000000001',
        clientId: '40000000-0000-0000-0000-000000000001',
        createdByName: 'Admin',
      },
    });
    expect(res.statusCode).toBe(500);
    await server.close();
  });

  it('should create ledger for valid input', async () => {
    const { pool } = createDrizzleMockPool([
      // 1. SELECT trust_accounts (verify account exists)
      { rows: [trustAccountArrayRow()], rowCount: 1 },
      // 2. SELECT client_ledgers (check duplicate — none found)
      { rows: [], rowCount: 0 },
      // 3. INSERT client_ledgers returning
      { rows: [clientLedgerArrayRow()], rowCount: 1 },
    ]);

    // Mock fetch for WebClientService.validateMatterClient
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => ({
      ok: true,
      json: async () => ({ valid: true, matterNumber: 'TEST-001', clientName: 'Test Client' }),
    })) as unknown as typeof fetch;

    try {
      const server = await buildServer({ pool, logLevel: 'silent' });
      const res = await server.inject({
        method: 'POST', url: `/api/trust/accounts/${VALID_UUID}/ledgers`,
        payload: {
          matterId: '30000000-0000-0000-0000-000000000001',
          clientId: '40000000-0000-0000-0000-000000000001',
          createdByName: 'Admin',
        },
      });
      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body).toHaveProperty('id');
      expect(body).toHaveProperty('matterNumber');
      expect(body.balance).toBe('0.00');
      await server.close();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

/* ═══════════════════════════════════════════════════════════════════════
 * GET /api/trust/accounts/:id/ledgers — List Ledgers (CON-002 §2.5)
 * ═══════════════════════════════════════════════════════════════════ */

describe('GET /api/trust/accounts/:id/ledgers', () => {
  it('should reject non-UUID id', async () => {
    const server = await buildServer({ pool: null, logLevel: 'silent' });
    const res = await server.inject({ method: 'GET', url: '/api/trust/accounts/not-a-uuid/ledgers' });
    expect(res.statusCode).toBe(400);
    await server.close();
  });

  it('should return 500 when pool is null', async () => {
    const server = await buildServer({ pool: null, logLevel: 'silent' });
    const res = await server.inject({ method: 'GET', url: `/api/trust/accounts/${VALID_UUID}/ledgers` });
    expect(res.statusCode).toBe(500);
    await server.close();
  });

  it('should return ledgers with balances', async () => {
    const { pool } = createDrizzleMockPool([
      // SELECT client_ledgers
      { rows: [clientLedgerArrayRow()], rowCount: 1 },
      // getLedgerBalance via client.query
      balanceRow('2500.00'),
    ]);
    const server = await buildServer({ pool, logLevel: 'silent' });
    const res = await server.inject({ method: 'GET', url: `/api/trust/accounts/${VALID_UUID}/ledgers` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].balance).toBe('2500.00');
    await server.close();
  });
});
