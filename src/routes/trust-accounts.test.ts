/**
 * @file src/routes/trust-accounts.test.ts
 * @description Unit tests for trust account route handlers.
 *
 * Tests request validation, route registration, and error responses.
 * Uses dev mode auth passthrough with pool: null.
 *
 * REF: GOV-002 (Testing Protocol)
 * REF: CON-002 §2.1-2.5
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../server.js';

const originalNodeEnv = process.env['NODE_ENV'];

beforeAll(() => { process.env['NODE_ENV'] = 'development'; });
afterAll(() => { process.env['NODE_ENV'] = originalNodeEnv; });

async function createTestServer() {
  return buildServer({ pool: null, logLevel: 'silent' });
}

describe('POST /api/trust/accounts', () => {
  it('should reject request with missing required fields', async () => {
    const server = await createTestServer();
    const response = await server.inject({
      method: 'POST',
      url: '/api/trust/accounts',
      payload: {},
    });
    expect(response.statusCode).toBe(400);
    await server.close();
  });

  it('should reject request with invalid accountType', async () => {
    const server = await createTestServer();
    const response = await server.inject({
      method: 'POST',
      url: '/api/trust/accounts',
      payload: {
        bankName: 'Test Bank',
        accountNumber: '123456789',
        routingNumber: '021000021',
        accountName: 'Test Account',
        accountType: 'invalid_type',
      },
    });
    expect(response.statusCode).toBe(400);
    await server.close();
  });

  it('should validate required fields: bankName, accountNumber, routingNumber, accountName, accountType', async () => {
    const server = await createTestServer();

    /* Missing bankName */
    const r1 = await server.inject({
      method: 'POST', url: '/api/trust/accounts',
      payload: { accountNumber: '123', routingNumber: '021000021', accountName: 'Test', accountType: 'iolta' },
    });
    expect(r1.statusCode).toBe(400);

    /* Missing accountType */
    const r2 = await server.inject({
      method: 'POST', url: '/api/trust/accounts',
      payload: { bankName: 'Bank', accountNumber: '123', routingNumber: '021000021', accountName: 'Test' },
    });
    expect(r2.statusCode).toBe(400);

    await server.close();
  });
});

describe('GET /api/trust/accounts', () => {
  it('should be a registered route', async () => {
    const server = await createTestServer();
    const response = await server.inject({ method: 'GET', url: '/api/trust/accounts' });
    /* Should NOT be 404 — route exists. Will be 500 due to null pool. */
    expect(response.statusCode).not.toBe(404);
    await server.close();
  });
});

describe('GET /api/trust/accounts/:id', () => {
  it('should reject non-UUID id parameter', async () => {
    const server = await createTestServer();
    const response = await server.inject({
      method: 'GET',
      url: '/api/trust/accounts/not-a-uuid',
    });
    expect(response.statusCode).toBe(400);
    await server.close();
  });

  it('should accept valid UUID id parameter', async () => {
    const server = await createTestServer();
    const response = await server.inject({
      method: 'GET',
      url: '/api/trust/accounts/00000000-0000-0000-0000-000000000001',
    });
    /* 500 (no pool) — NOT 400 (validation) or 404 (route missing) */
    expect(response.statusCode).not.toBe(404);
    expect(response.statusCode).not.toBe(400);
    await server.close();
  });
});

describe('POST /api/trust/accounts/:id/ledgers', () => {
  it('should reject invalid body', async () => {
    const server = await createTestServer();
    const response = await server.inject({
      method: 'POST',
      url: '/api/trust/accounts/00000000-0000-0000-0000-000000000001/ledgers',
      payload: {},
    });
    expect(response.statusCode).toBe(400);
    await server.close();
  });

  it('should reject missing matterId', async () => {
    const server = await createTestServer();
    const response = await server.inject({
      method: 'POST',
      url: '/api/trust/accounts/00000000-0000-0000-0000-000000000001/ledgers',
      payload: { clientId: '00000000-0000-0000-0000-000000000002' },
    });
    expect(response.statusCode).toBe(400);
    await server.close();
  });
});

describe('GET /api/trust/accounts/:id/ledgers', () => {
  it('should reject non-UUID id', async () => {
    const server = await createTestServer();
    const response = await server.inject({
      method: 'GET',
      url: '/api/trust/accounts/invalid/ledgers',
    });
    expect(response.statusCode).toBe(400);
    await server.close();
  });

  it('should accept valid UUID', async () => {
    const server = await createTestServer();
    const response = await server.inject({
      method: 'GET',
      url: '/api/trust/accounts/00000000-0000-0000-0000-000000000001/ledgers',
    });
    expect(response.statusCode).not.toBe(404);
    expect(response.statusCode).not.toBe(400);
    await server.close();
  });
});
