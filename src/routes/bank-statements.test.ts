/**
 * @file src/routes/bank-statements.test.ts
 * @description Tests for bank statement import route.
 *
 * REF: GOV-002 (Testing Protocol)
 * REF: CON-002 §5.1
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../server.js';

const originalNodeEnv = process.env['NODE_ENV'];
beforeAll(() => { process.env['NODE_ENV'] = 'development'; });
afterAll(() => { process.env['NODE_ENV'] = originalNodeEnv; });

const VALID_UUID = '10000000-0000-0000-0000-000000000001';

describe('POST /api/trust/bank-statements/import', () => {
  it('should reject empty body', async () => {
    const server = await buildServer({ pool: null, logLevel: 'silent' });
    const res = await server.inject({
      method: 'POST', url: '/api/trust/bank-statements/import', payload: {},
    });
    expect(res.statusCode).toBe(400);
    await server.close();
  });

  it('should reject missing trustAccountId', async () => {
    const server = await buildServer({ pool: null, logLevel: 'silent' });
    const res = await server.inject({
      method: 'POST', url: '/api/trust/bank-statements/import',
      payload: {
        statementDate: '2026-01-31',
        importedByName: 'Admin',
        transactions: [],
      },
    });
    expect(res.statusCode).toBe(400);
    await server.close();
  });

  it('should reject missing transactions array', async () => {
    const server = await buildServer({ pool: null, logLevel: 'silent' });
    const res = await server.inject({
      method: 'POST', url: '/api/trust/bank-statements/import',
      payload: {
        trustAccountId: VALID_UUID,
        statementDate: '2026-01-31',
        importedByName: 'Admin',
      },
    });
    expect(res.statusCode).toBe(400);
    await server.close();
  });

  it('should reject missing importedByName', async () => {
    const server = await buildServer({ pool: null, logLevel: 'silent' });
    const res = await server.inject({
      method: 'POST', url: '/api/trust/bank-statements/import',
      payload: {
        trustAccountId: VALID_UUID,
        statementDate: '2026-01-31',
        transactions: [],
      },
    });
    expect(res.statusCode).toBe(400);
    await server.close();
  });

  it('should return 500 when pool is null with valid body', async () => {
    const server = await buildServer({ pool: null, logLevel: 'silent' });
    const res = await server.inject({
      method: 'POST', url: '/api/trust/bank-statements/import',
      payload: {
        trustAccountId: VALID_UUID,
        statementDate: '2026-01-31',
        importedByName: 'Admin',
        transactions: [
          { externalId: 'TXN-001', date: '2026-01-15', description: 'Deposit', amount: '5000.00' },
        ],
      },
    });
    expect(res.statusCode).toBe(500);
    await server.close();
  });

  it('should reject invalid transaction items', async () => {
    const server = await buildServer({ pool: null, logLevel: 'silent' });
    const res = await server.inject({
      method: 'POST', url: '/api/trust/bank-statements/import',
      payload: {
        trustAccountId: VALID_UUID,
        statementDate: '2026-01-31',
        importedByName: 'Admin',
        transactions: [
          { invalidField: 'no externalId' },
        ],
      },
    });
    expect(res.statusCode).toBe(400);
    await server.close();
  });
});
