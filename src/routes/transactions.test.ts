/**
 * @file src/routes/transactions.test.ts
 * @description Unit tests for transaction route handlers.
 *
 * Tests TypeBox schema validation for deposit, disburse, transfer,
 * fee-transfer and void routes. Uses dev mode auth passthrough with pool: null.
 *
 * REF: GOV-002 (Testing Protocol)
 * REF: CON-002 §3.1-3.5
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../server.js';

const originalNodeEnv = process.env['NODE_ENV'];

beforeAll(() => { process.env['NODE_ENV'] = 'development'; });
afterAll(() => { process.env['NODE_ENV'] = originalNodeEnv; });

async function createTestServer() {
  return buildServer({ pool: null, logLevel: 'silent' });
}

const VALID_UUID = '00000000-0000-0000-0000-000000000001';

describe('POST /api/trust/transactions/deposit', () => {
  it('should reject empty body', async () => {
    const server = await createTestServer();
    const response = await server.inject({
      method: 'POST', url: '/api/trust/transactions/deposit', payload: {},
    });
    expect(response.statusCode).toBe(400);
    await server.close();
  });

  it('should reject missing trustAccountId', async () => {
    const server = await createTestServer();
    const response = await server.inject({
      method: 'POST', url: '/api/trust/transactions/deposit',
      payload: {
        clientLedgerId: VALID_UUID, amount: '100.00',
        description: 'test', payorName: 'payor', paymentMethod: 'check',
        createdByName: 'tester',
      },
    });
    expect(response.statusCode).toBe(400);
    await server.close();
  });

  it('should reject invalid paymentMethod', async () => {
    const server = await createTestServer();
    const response = await server.inject({
      method: 'POST', url: '/api/trust/transactions/deposit',
      payload: {
        trustAccountId: VALID_UUID, clientLedgerId: VALID_UUID,
        amount: '100.00', description: 'test', payorName: 'payor',
        paymentMethod: 'bitcoin', createdByName: 'tester',
      },
    });
    expect(response.statusCode).toBe(400);
    await server.close();
  });

  it('should accept valid deposit payload (fails on pool, not validation)', async () => {
    const server = await createTestServer();
    const response = await server.inject({
      method: 'POST', url: '/api/trust/transactions/deposit',
      payload: {
        trustAccountId: VALID_UUID, clientLedgerId: VALID_UUID,
        amount: '100.00', description: 'Retainer', payorName: 'Client',
        paymentMethod: 'check', createdByName: 'Attorney',
      },
    });
    /* Not 400 (passed validation) or 404 (route exists) — likely 500 (no pool) */
    expect(response.statusCode).not.toBe(400);
    expect(response.statusCode).not.toBe(404);
    await server.close();
  });
});

describe('POST /api/trust/transactions/disburse', () => {
  it('should reject empty body', async () => {
    const server = await createTestServer();
    const response = await server.inject({
      method: 'POST', url: '/api/trust/transactions/disburse', payload: {},
    });
    expect(response.statusCode).toBe(400);
    await server.close();
  });

  it('should reject missing amount', async () => {
    const server = await createTestServer();
    const response = await server.inject({
      method: 'POST', url: '/api/trust/transactions/disburse',
      payload: {
        trustAccountId: VALID_UUID, clientLedgerId: VALID_UUID,
        description: 'test', payeeName: 'vendor', paymentMethod: 'wire',
        createdByName: 'tester',
      },
    });
    expect(response.statusCode).toBe(400);
    await server.close();
  });

  it('should accept valid disburse payload', async () => {
    const server = await createTestServer();
    const response = await server.inject({
      method: 'POST', url: '/api/trust/transactions/disburse',
      payload: {
        trustAccountId: VALID_UUID, clientLedgerId: VALID_UUID,
        amount: '50.00', description: 'Court fee', payeeName: 'Court',
        paymentMethod: 'check', createdByName: 'Attorney',
      },
    });
    expect(response.statusCode).not.toBe(400);
    expect(response.statusCode).not.toBe(404);
    await server.close();
  });
});

describe('POST /api/trust/transactions/transfer', () => {
  it('should reject empty body', async () => {
    const server = await createTestServer();
    const response = await server.inject({
      method: 'POST', url: '/api/trust/transactions/transfer', payload: {},
    });
    expect(response.statusCode).toBe(400);
    await server.close();
  });

  it('should reject missing fromLedgerId', async () => {
    const server = await createTestServer();
    const response = await server.inject({
      method: 'POST', url: '/api/trust/transactions/transfer',
      payload: {
        trustAccountId: VALID_UUID, toLedgerId: VALID_UUID,
        amount: '25.00', description: 'transfer', createdByName: 'tester',
      },
    });
    expect(response.statusCode).toBe(400);
    await server.close();
  });

  it('should accept valid transfer payload', async () => {
    const server = await createTestServer();
    const response = await server.inject({
      method: 'POST', url: '/api/trust/transactions/transfer',
      payload: {
        trustAccountId: VALID_UUID,
        fromLedgerId: '00000000-0000-0000-0000-000000000002',
        toLedgerId: '00000000-0000-0000-0000-000000000003',
        amount: '25.00', description: 'Transfer', createdByName: 'Attorney',
      },
    });
    expect(response.statusCode).not.toBe(400);
    expect(response.statusCode).not.toBe(404);
    await server.close();
  });
});

describe('POST /api/trust/transactions/fee-transfer', () => {
  it('should reject empty body', async () => {
    const server = await createTestServer();
    const response = await server.inject({
      method: 'POST', url: '/api/trust/transactions/fee-transfer', payload: {},
    });
    expect(response.statusCode).toBe(400);
    await server.close();
  });

  it('should accept valid fee-transfer payload', async () => {
    const server = await createTestServer();
    const response = await server.inject({
      method: 'POST', url: '/api/trust/transactions/fee-transfer',
      payload: {
        trustAccountId: VALID_UUID, clientLedgerId: VALID_UUID,
        operatingAccountId: '00000000-0000-0000-0000-000000000002',
        amount: '150.00', description: 'Legal fees', createdByName: 'Attorney',
      },
    });
    expect(response.statusCode).not.toBe(400);
    expect(response.statusCode).not.toBe(404);
    await server.close();
  });
});

describe('POST /api/trust/transactions/:entryId/void', () => {
  it('should reject empty body', async () => {
    const server = await createTestServer();
    const response = await server.inject({
      method: 'POST',
      url: `/api/trust/transactions/${VALID_UUID}/void`,
      payload: {},
    });
    expect(response.statusCode).toBe(400);
    await server.close();
  });

  it('should reject non-UUID entryId', async () => {
    const server = await createTestServer();
    const response = await server.inject({
      method: 'POST',
      url: '/api/trust/transactions/not-a-uuid/void',
      payload: { reason: 'test', voidedByName: 'tester' },
    });
    expect(response.statusCode).toBe(400);
    await server.close();
  });

  it('should accept valid void payload', async () => {
    const server = await createTestServer();
    const response = await server.inject({
      method: 'POST',
      url: `/api/trust/transactions/${VALID_UUID}/void`,
      payload: { reason: 'Error correction', voidedByName: 'Attorney' },
    });
    expect(response.statusCode).not.toBe(400);
    expect(response.statusCode).not.toBe(404);
    await server.close();
  });
});
