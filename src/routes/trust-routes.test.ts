/**
 * @file src/routes/trust-routes.test.ts
 * @description Unit tests for trust accounting routes.
 *
 * Tests auth middleware, route registration, and request validation
 * without requiring a live database.
 *
 * REF: GOV-002 (Testing Protocol)
 * REF: CON-002 §2-5 (Route specifications)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../server.js';

/* Store original env and set development mode for auth passthrough */
const originalEnv = { ...process.env };

beforeAll(() => {
  process.env['NODE_ENV'] = 'development';
});

afterAll(() => {
  process.env['NODE_ENV'] = originalEnv['NODE_ENV'];
});

/**
 * Helper: create a test server with no pool and silent logging.
 */
async function createTestServer() {
  return buildServer({ pool: null, logLevel: 'silent' });
}

describe('Auth Middleware', () => {
  it('should allow /health without X-Internal-Service-Key', async () => {
    const server = await createTestServer();
    const response = await server.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    await server.close();
  });

  it('should reject trust routes without X-Internal-Service-Key in production', async () => {
    const originalEnv = process.env['NODE_ENV'];
    process.env['NODE_ENV'] = 'production';
    process.env['INTERNAL_SERVICE_KEY'] = 'test-key-123';

    try {
      const server = await createTestServer();
      const response = await server.inject({
        method: 'GET',
        url: '/api/trust/accounts',
      });

      expect(response.statusCode).toBe(401);
      const body = response.json<{ error: { code: string } }>();
      expect(body.error.code).toBe('UNAUTHORIZED');
      await server.close();
    } finally {
      process.env['NODE_ENV'] = originalEnv;
      delete process.env['INTERNAL_SERVICE_KEY'];
    }
  });
});

describe('Trust Account Routes — Request Validation', () => {
  it('POST /api/trust/accounts should reject invalid body', async () => {
    const server = await createTestServer();
    const response = await server.inject({
      method: 'POST',
      url: '/api/trust/accounts',
      payload: { invalid: 'data' },
    });

    /* TypeBox schema validation returns 400 for invalid bodies */
    expect(response.statusCode).toBe(400);
    await server.close();
  });

  it('GET /api/trust/accounts/:id should reject non-UUID param', async () => {
    const server = await createTestServer();
    const response = await server.inject({
      method: 'GET',
      url: '/api/trust/accounts/not-a-uuid',
    });

    expect(response.statusCode).toBe(400);
    await server.close();
  });

  it('POST /api/trust/accounts/:id/ledgers should reject invalid body', async () => {
    const server = await createTestServer();
    const response = await server.inject({
      method: 'POST',
      url: '/api/trust/accounts/00000000-0000-0000-0000-000000000001/ledgers',
      payload: { missing: 'required fields' },
    });

    expect(response.statusCode).toBe(400);
    await server.close();
  });
});

describe('Transaction Routes — Request Validation', () => {
  it('POST /api/trust/transactions/deposit should reject empty body', async () => {
    const server = await createTestServer();
    const response = await server.inject({
      method: 'POST',
      url: '/api/trust/transactions/deposit',
      payload: {},
    });

    expect(response.statusCode).toBe(400);
    await server.close();
  });

  it('POST /api/trust/transactions/disburse should reject empty body', async () => {
    const server = await createTestServer();
    const response = await server.inject({
      method: 'POST',
      url: '/api/trust/transactions/disburse',
      payload: {},
    });

    expect(response.statusCode).toBe(400);
    await server.close();
  });

  it('POST /api/trust/transactions/transfer should reject empty body', async () => {
    const server = await createTestServer();
    const response = await server.inject({
      method: 'POST',
      url: '/api/trust/transactions/transfer',
      payload: {},
    });

    expect(response.statusCode).toBe(400);
    await server.close();
  });

  it('POST /api/trust/transactions/fee-transfer should reject empty body', async () => {
    const server = await createTestServer();
    const response = await server.inject({
      method: 'POST',
      url: '/api/trust/transactions/fee-transfer',
      payload: {},
    });

    expect(response.statusCode).toBe(400);
    await server.close();
  });

  it('POST /api/trust/transactions/:entryId/void should reject invalid body', async () => {
    const server = await createTestServer();
    const response = await server.inject({
      method: 'POST',
      url: '/api/trust/transactions/00000000-0000-0000-0000-000000000001/void',
      payload: {},
    });

    expect(response.statusCode).toBe(400);
    await server.close();
  });

  it('POST /api/trust/transactions/:entryId/void should reject non-UUID entryId', async () => {
    const server = await createTestServer();
    const response = await server.inject({
      method: 'POST',
      url: '/api/trust/transactions/not-a-uuid/void',
      payload: { reason: 'test', voidedByName: 'tester' },
    });

    expect(response.statusCode).toBe(400);
    await server.close();
  });
});

describe('Bank Statement Routes — Request Validation', () => {
  it('POST /api/trust/bank-statements/import should reject empty body', async () => {
    const server = await createTestServer();
    const response = await server.inject({
      method: 'POST',
      url: '/api/trust/bank-statements/import',
      payload: {},
    });

    expect(response.statusCode).toBe(400);
    await server.close();
  });
});

describe('Reconciliation Routes — Request Validation', () => {
  it('POST /api/trust/reconciliation should reject empty body', async () => {
    const server = await createTestServer();
    const response = await server.inject({
      method: 'POST',
      url: '/api/trust/reconciliation',
      payload: {},
    });

    expect(response.statusCode).toBe(400);
    await server.close();
  });

  it('GET /api/trust/reconciliation/:id should reject non-UUID', async () => {
    const server = await createTestServer();
    const response = await server.inject({
      method: 'GET',
      url: '/api/trust/reconciliation/not-a-uuid',
    });

    expect(response.statusCode).toBe(400);
    await server.close();
  });

  it('GET /api/trust/accounts/:id/three-way-report should reject non-UUID', async () => {
    const server = await createTestServer();
    const response = await server.inject({
      method: 'GET',
      url: '/api/trust/accounts/not-a-uuid/three-way-report',
    });

    expect(response.statusCode).toBe(400);
    await server.close();
  });
});

describe('Route Registration', () => {
  it('should register all trust accounting routes', async () => {
    const server = await createTestServer();
    await server.ready();

    /* Verify routes exist by checking that they return non-404 responses */
    const routes = [
      { method: 'POST' as const, url: '/api/trust/accounts' },
      { method: 'GET' as const, url: '/api/trust/accounts' },
      { method: 'POST' as const, url: '/api/trust/transactions/deposit' },
      { method: 'POST' as const, url: '/api/trust/transactions/disburse' },
      { method: 'POST' as const, url: '/api/trust/transactions/transfer' },
      { method: 'POST' as const, url: '/api/trust/transactions/fee-transfer' },
      { method: 'POST' as const, url: '/api/trust/bank-statements/import' },
      { method: 'POST' as const, url: '/api/trust/reconciliation' },
    ];

    for (const route of routes) {
      const response = await server.inject({ method: route.method, url: route.url, payload: {} });
      /* 400 (validation) or 500 (no pool) — but NOT 404 (route not found) */
      expect(response.statusCode, `${route.method} ${route.url} should be registered`).not.toBe(404);
    }

    await server.close();
  });
});
