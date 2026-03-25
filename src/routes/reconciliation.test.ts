/**
 * @file src/routes/reconciliation.test.ts
 * @description Tests for reconciliation routes — start, get details, three-way report.
 *
 * REF: GOV-002 (Testing Protocol)
 * REF: CON-002 §5.2-5.4
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../server.js';

const originalNodeEnv = process.env['NODE_ENV'];
beforeAll(() => { process.env['NODE_ENV'] = 'development'; });
afterAll(() => { process.env['NODE_ENV'] = originalNodeEnv; });

const VALID_UUID = '00000000-0000-0000-0000-000000000001';

/* ═══════════════════════════════════════════════════════════════════════
 * POST /api/trust/reconciliation — Start Session (CON-002 §5.2)
 * ═══════════════════════════════════════════════════════════════════ */

describe('POST /api/trust/reconciliation', () => {
  it('should reject empty body', async () => {
    const server = await buildServer({ pool: null, logLevel: 'silent' });
    const res = await server.inject({
      method: 'POST', url: '/api/trust/reconciliation', payload: {},
    });
    expect(res.statusCode).toBe(400);
    await server.close();
  });

  it('should reject missing trustAccountId', async () => {
    const server = await buildServer({ pool: null, logLevel: 'silent' });
    const res = await server.inject({
      method: 'POST', url: '/api/trust/reconciliation',
      payload: {
        statementEndDate: '2026-01-31',
        statementEndBalance: '50000.00',
        preparedByName: 'Admin',
      },
    });
    expect(res.statusCode).toBe(400);
    await server.close();
  });

  it('should reject missing statementEndBalance', async () => {
    const server = await buildServer({ pool: null, logLevel: 'silent' });
    const res = await server.inject({
      method: 'POST', url: '/api/trust/reconciliation',
      payload: {
        trustAccountId: VALID_UUID,
        statementEndDate: '2026-01-31',
        preparedByName: 'Admin',
      },
    });
    expect(res.statusCode).toBe(400);
    await server.close();
  });

  it('should return 500 when pool is null with valid body', async () => {
    const server = await buildServer({ pool: null, logLevel: 'silent' });
    const res = await server.inject({
      method: 'POST', url: '/api/trust/reconciliation',
      payload: {
        trustAccountId: VALID_UUID,
        statementEndDate: '2026-01-31',
        statementEndBalance: '50000.00',
        preparedByName: 'Admin',
      },
    });
    expect(res.statusCode).toBe(500);
    await server.close();
  });
});

/* ═══════════════════════════════════════════════════════════════════════
 * GET /api/trust/reconciliation/:id — Get Details (CON-002 §5.3)
 * ═══════════════════════════════════════════════════════════════════ */

describe('GET /api/trust/reconciliation/:id', () => {
  it('should reject non-UUID id', async () => {
    const server = await buildServer({ pool: null, logLevel: 'silent' });
    const res = await server.inject({
      method: 'GET', url: '/api/trust/reconciliation/not-a-uuid',
    });
    expect(res.statusCode).toBe(400);
    await server.close();
  });

  it('should return 500 when pool is null with valid UUID', async () => {
    const server = await buildServer({ pool: null, logLevel: 'silent' });
    const res = await server.inject({
      method: 'GET', url: `/api/trust/reconciliation/${VALID_UUID}`,
    });
    expect(res.statusCode).toBe(500);
    await server.close();
  });
});

/* ═══════════════════════════════════════════════════════════════════════
 * GET /api/trust/accounts/:id/three-way-report — (CON-002 §5.4)
 * ═══════════════════════════════════════════════════════════════════ */

describe('GET /api/trust/accounts/:id/three-way-report', () => {
  it('should reject non-UUID id', async () => {
    const server = await buildServer({ pool: null, logLevel: 'silent' });
    const res = await server.inject({
      method: 'GET', url: '/api/trust/accounts/bad-uuid/three-way-report',
    });
    expect(res.statusCode).toBe(400);
    await server.close();
  });

  it('should return 500 when pool is null with valid UUID', async () => {
    const server = await buildServer({ pool: null, logLevel: 'silent' });
    const res = await server.inject({
      method: 'GET', url: `/api/trust/accounts/${VALID_UUID}/three-way-report`,
    });
    expect(res.statusCode).toBe(500);
    await server.close();
  });
});
