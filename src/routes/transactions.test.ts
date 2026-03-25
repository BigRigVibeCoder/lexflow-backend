/**
 * @file src/routes/transactions.test.ts
 * @description Tests for transaction routes — deposit, disburse, transfer, fee-transfer, void.
 *
 * Uses Drizzle-compatible sequential mock pool to exercise handler code
 * paths behind getEngine(pool).
 *
 * REF: GOV-002 (Testing Protocol)
 * REF: CON-002 §3.1-3.5
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../server.js';
import {
  createDrizzleMockPool,
  clientLedgerArrayRow,
  balanceRow,
  EMPTY,
} from '../test-helpers/drizzle-mock-pool.js';

const originalNodeEnv = process.env['NODE_ENV'];
beforeAll(() => { process.env['NODE_ENV'] = 'development'; });
afterAll(() => { process.env['NODE_ENV'] = originalNodeEnv; });

const VALID_UUID = '10000000-0000-0000-0000-000000000001';
const VALID_LEDGER_UUID = '20000000-0000-0000-0000-000000000001';

/**
 * Deposit sequence for LedgerEngine.recordDeposit:
 * BEGIN, SET lock_timeout, SELECT client_ledgers, advisory lock, balance, INSERT, trust balance, COMMIT
 */
function depositSequence(ledgerBalance = '5000.00', trustBalance = '10000.00') {
  return [
    EMPTY,                                                    // BEGIN
    EMPTY,                                                    // SET LOCAL lock_timeout
    { rows: [clientLedgerArrayRow()], rowCount: 1 },          // getLedgerOrThrow (Drizzle array)
    { rows: [{ pg_advisory_xact_lock: '' }], rowCount: 1 },  // advisory lock
    balanceRow(ledgerBalance),                                // getClientLedgerBalanceRaw
    EMPTY,                                                    // INSERT journal_entries
    balanceRow(trustBalance),                                 // getTrustAccountBalanceRaw
    EMPTY,                                                    // COMMIT
  ];
}

function transferSequence(fromBalance = '5000.00') {
  return [
    EMPTY, EMPTY,
    { rows: [clientLedgerArrayRow()], rowCount: 1 },
    { rows: [clientLedgerArrayRow('20000000-0000-0000-0000-000000000002')], rowCount: 1 },
    { rows: [{ pg_advisory_xact_lock: '' }], rowCount: 1 },
    { rows: [{ pg_advisory_xact_lock: '' }], rowCount: 1 },
    balanceRow(fromBalance),
    balanceRow('3000.00'),
    EMPTY, EMPTY,
    EMPTY, // COMMIT
  ];
}

/* ═══════════════════════════════════════════════════════════════════════
 * POST /api/trust/transactions/deposit — CON-002 §3.1
 * ═══════════════════════════════════════════════════════════════════ */

describe('POST /api/trust/transactions/deposit', () => {
  it('should reject empty body', async () => {
    const server = await buildServer({ pool: null, logLevel: 'silent' });
    const res = await server.inject({ method: 'POST', url: '/api/trust/transactions/deposit', payload: {} });
    expect(res.statusCode).toBe(400);
    await server.close();
  });

  it('should return 500 when pool is null', async () => {
    const server = await buildServer({ pool: null, logLevel: 'silent' });
    const res = await server.inject({
      method: 'POST', url: '/api/trust/transactions/deposit',
      payload: {
        trustAccountId: VALID_UUID, clientLedgerId: VALID_LEDGER_UUID,
        amount: '1000.00', description: 'Test', payorName: 'Test',
        paymentMethod: 'check', createdByName: 'Admin',
      },
    });
    expect(res.statusCode).toBe(500);
    await server.close();
  });

  it('should record deposit with valid pool', async () => {
    const { pool } = createDrizzleMockPool(depositSequence());
    const server = await buildServer({ pool, logLevel: 'silent' });

    const res = await server.inject({
      method: 'POST', url: '/api/trust/transactions/deposit',
      payload: {
        trustAccountId: VALID_UUID, clientLedgerId: VALID_LEDGER_UUID,
        amount: '1000.00', description: 'Retainer deposit', payorName: 'John Doe',
        paymentMethod: 'check', createdByName: 'Admin',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body).toHaveProperty('entryId');
    expect(body).toHaveProperty('trustAccountBalance');
    expect(body).toHaveProperty('clientLedgerBalance');
    await server.close();
  });
});

/* ═══════════════════════════════════════════════════════════════════════
 * POST /api/trust/transactions/disburse — CON-002 §3.2
 * ═══════════════════════════════════════════════════════════════════ */

describe('POST /api/trust/transactions/disburse', () => {
  it('should reject empty body', async () => {
    const server = await buildServer({ pool: null, logLevel: 'silent' });
    const res = await server.inject({ method: 'POST', url: '/api/trust/transactions/disburse', payload: {} });
    expect(res.statusCode).toBe(400);
    await server.close();
  });

  it('should return 500 when pool is null', async () => {
    const server = await buildServer({ pool: null, logLevel: 'silent' });
    const res = await server.inject({
      method: 'POST', url: '/api/trust/transactions/disburse',
      payload: {
        trustAccountId: VALID_UUID, clientLedgerId: VALID_LEDGER_UUID,
        amount: '500.00', description: 'Filing fee', payeeName: 'Court',
        paymentMethod: 'check', createdByName: 'Admin',
      },
    });
    expect(res.statusCode).toBe(500);
    await server.close();
  });

  it('should disburse with valid pool', async () => {
    const { pool } = createDrizzleMockPool(depositSequence('5000.00'));
    const server = await buildServer({ pool, logLevel: 'silent' });

    const res = await server.inject({
      method: 'POST', url: '/api/trust/transactions/disburse',
      payload: {
        trustAccountId: VALID_UUID, clientLedgerId: VALID_LEDGER_UUID,
        amount: '500.00', description: 'Filing fee', payeeName: 'Superior Court',
        paymentMethod: 'check', createdByName: 'Admin',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.clientLedgerBalance).toBe('4500.00');
    await server.close();
  });
});

/* ═══════════════════════════════════════════════════════════════════════
 * POST /api/trust/transactions/transfer — CON-002 §3.3
 * ═══════════════════════════════════════════════════════════════════ */

describe('POST /api/trust/transactions/transfer', () => {
  it('should reject empty body', async () => {
    const server = await buildServer({ pool: null, logLevel: 'silent' });
    const res = await server.inject({ method: 'POST', url: '/api/trust/transactions/transfer', payload: {} });
    expect(res.statusCode).toBe(400);
    await server.close();
  });

  it('should transfer with valid pool', async () => {
    const { pool } = createDrizzleMockPool(transferSequence('3000.00'));
    const server = await buildServer({ pool, logLevel: 'silent' });

    const res = await server.inject({
      method: 'POST', url: '/api/trust/transactions/transfer',
      payload: {
        trustAccountId: VALID_UUID,
        fromLedgerId: VALID_LEDGER_UUID,
        toLedgerId: '20000000-0000-0000-0000-000000000002',
        amount: '1500.00', description: 'Transfer', createdByName: 'Admin',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body).toHaveProperty('entryId');
    expect(body).toHaveProperty('fromLedgerBalance');
    expect(body).toHaveProperty('toLedgerBalance');
    await server.close();
  });
});

/* ═══════════════════════════════════════════════════════════════════════
 * POST /api/trust/transactions/fee-transfer — CON-002 §3.4
 * ═══════════════════════════════════════════════════════════════════ */

describe('POST /api/trust/transactions/fee-transfer', () => {
  it('should reject empty body', async () => {
    const server = await buildServer({ pool: null, logLevel: 'silent' });
    const res = await server.inject({ method: 'POST', url: '/api/trust/transactions/fee-transfer', payload: {} });
    expect(res.statusCode).toBe(400);
    await server.close();
  });

  it('should process fee transfer with valid pool', async () => {
    const { pool } = createDrizzleMockPool(depositSequence('5000.00'));
    const server = await buildServer({ pool, logLevel: 'silent' });

    const res = await server.inject({
      method: 'POST', url: '/api/trust/transactions/fee-transfer',
      payload: {
        trustAccountId: VALID_UUID, clientLedgerId: VALID_LEDGER_UUID,
        operatingAccountId: '10000000-0000-0000-0000-000000000002',
        amount: '250.00', description: 'Legal fee', createdByName: 'Admin',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.clientLedgerBalance).toBe('4750.00');
    await server.close();
  });
});

/* ═══════════════════════════════════════════════════════════════════════
 * POST /api/trust/transactions/:entryId/void — CON-002 §3.5
 * ═══════════════════════════════════════════════════════════════════ */

describe('POST /api/trust/transactions/:entryId/void', () => {
  it('should reject empty body', async () => {
    const server = await buildServer({ pool: null, logLevel: 'silent' });
    const res = await server.inject({
      method: 'POST',
      url: `/api/trust/transactions/${VALID_UUID}/void`,
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    await server.close();
  });

  it('should reject non-UUID entryId', async () => {
    const server = await buildServer({ pool: null, logLevel: 'silent' });
    const res = await server.inject({
      method: 'POST',
      url: '/api/trust/transactions/not-a-uuid/void',
      payload: { reason: 'Error', voidedByName: 'Admin' },
    });
    expect(res.statusCode).toBe(400);
    await server.close();
  });

  it('should return 500 when pool is null', async () => {
    const server = await buildServer({ pool: null, logLevel: 'silent' });
    const res = await server.inject({
      method: 'POST',
      url: `/api/trust/transactions/${VALID_UUID}/void`,
      payload: { reason: 'Entered in error', voidedByName: 'Admin' },
    });
    expect(res.statusCode).toBe(500);
    await server.close();
  });
});
