/**
 * @file src/routes/transaction-queries.test.ts
 * @description Tests for transaction query routes — ledger history and transaction detail.
 *
 * REF: GOV-002 (Testing Protocol)
 * REF: CON-002 §4.1-4.2
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../server.js';

const originalNodeEnv = process.env['NODE_ENV'];
beforeAll(() => { process.env['NODE_ENV'] = 'development'; });
afterAll(() => { process.env['NODE_ENV'] = originalNodeEnv; });

const VALID_UUID = '00000000-0000-0000-0000-000000000001';

/* ═══════════════════════════════════════════════════════════════════════
 * GET /api/trust/ledgers/:id/transactions — Ledger History (CON-002 §4.1)
 * ═══════════════════════════════════════════════════════════════════ */

describe('GET /api/trust/ledgers/:id/transactions', () => {
  it('should reject non-UUID ledger id', async () => {
    const server = await buildServer({ pool: null, logLevel: 'silent' });
    const res = await server.inject({
      method: 'GET', url: '/api/trust/ledgers/bad-uuid/transactions',
    });
    expect(res.statusCode).toBe(400);
    await server.close();
  });

  it('should return 500 when pool is null with valid UUID', async () => {
    const server = await buildServer({ pool: null, logLevel: 'silent' });
    const res = await server.inject({
      method: 'GET', url: `/api/trust/ledgers/${VALID_UUID}/transactions`,
    });
    expect(res.statusCode).toBe(500);
    await server.close();
  });

  it('should accept pagination query parameters', async () => {
    const server = await buildServer({ pool: null, logLevel: 'silent' });
    const res = await server.inject({
      method: 'GET',
      url: `/api/trust/ledgers/${VALID_UUID}/transactions?page=2&pageSize=25`,
    });
    /* Route exists but pool is null → 500 not 404 */
    expect(res.statusCode).toBe(500);
    await server.close();
  });

  it('should accept date range query parameters', async () => {
    const server = await buildServer({ pool: null, logLevel: 'silent' });
    const res = await server.inject({
      method: 'GET',
      url: `/api/trust/ledgers/${VALID_UUID}/transactions?startDate=2026-01-01&endDate=2026-01-31`,
    });
    expect(res.statusCode).toBe(500);
    await server.close();
  });
});

/* ═══════════════════════════════════════════════════════════════════════
 * GET /api/trust/transactions/:id — Transaction Detail (CON-002 §4.2)
 * ═══════════════════════════════════════════════════════════════════ */

describe('GET /api/trust/transactions/:id', () => {
  it('should reject non-UUID id', async () => {
    const server = await buildServer({ pool: null, logLevel: 'silent' });
    const res = await server.inject({
      method: 'GET', url: '/api/trust/transactions/bad-uuid',
    });
    expect(res.statusCode).toBe(400);
    await server.close();
  });

  it('should return 500 when pool is null with valid UUID', async () => {
    const server = await buildServer({ pool: null, logLevel: 'silent' });
    const res = await server.inject({
      method: 'GET', url: `/api/trust/transactions/${VALID_UUID}`,
    });
    expect(res.statusCode).toBe(500);
    await server.close();
  });
});
