/**
 * @file src/plugins/auth.test.ts
 * @description Unit tests for the auth middleware plugin.
 *
 * REF: GOV-002 (Testing Protocol)
 * REF: SPR-004 T-035V (Auth Middleware)
 */

import { describe, it, expect, afterEach } from 'vitest';
import { buildServer } from '../server.js';

const VALID_KEY = 'test-service-key-123';

describe('Auth Middleware', () => {
  afterEach(() => {
    delete process.env['INTERNAL_SERVICE_KEY'];
  });

  it('should exempt /health from auth in production', async () => {
    process.env['NODE_ENV'] = 'production';
    process.env['INTERNAL_SERVICE_KEY'] = VALID_KEY;
    const server = await buildServer({ pool: null, logLevel: 'silent' });

    const response = await server.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    await server.close();
    process.env['NODE_ENV'] = 'test';
  });

  it('should reject requests without X-Internal-Service-Key in production', async () => {
    process.env['NODE_ENV'] = 'production';
    process.env['INTERNAL_SERVICE_KEY'] = VALID_KEY;
    const server = await buildServer({ pool: null, logLevel: 'silent' });

    const response = await server.inject({
      method: 'GET',
      url: '/api/trust/accounts',
    });

    expect(response.statusCode).toBe(401);
    const body = response.json<{ error: { code: string; message: string } }>();
    expect(body.error.code).toBe('UNAUTHORIZED');
    expect(body.error.message).toBeDefined();
    await server.close();
    process.env['NODE_ENV'] = 'test';
  });

  it('should accept requests with valid X-Internal-Service-Key', async () => {
    process.env['NODE_ENV'] = 'production';
    process.env['INTERNAL_SERVICE_KEY'] = VALID_KEY;
    const server = await buildServer({ pool: null, logLevel: 'silent' });

    const response = await server.inject({
      method: 'GET',
      url: '/api/trust/accounts',
      headers: { 'x-internal-service-key': VALID_KEY },
    });

    /* 500 because pool is null, but NOT 401 — auth passed */
    expect(response.statusCode).not.toBe(401);
    await server.close();
    process.env['NODE_ENV'] = 'test';
  });

  it('should reject requests with wrong key', async () => {
    process.env['NODE_ENV'] = 'production';
    process.env['INTERNAL_SERVICE_KEY'] = VALID_KEY;
    const server = await buildServer({ pool: null, logLevel: 'silent' });

    const response = await server.inject({
      method: 'GET',
      url: '/api/trust/accounts',
      headers: { 'x-internal-service-key': 'wrong-key' },
    });

    expect(response.statusCode).toBe(401);
    await server.close();
    process.env['NODE_ENV'] = 'test';
  });

  it('should return correct error shape on 401', async () => {
    process.env['NODE_ENV'] = 'production';
    process.env['INTERNAL_SERVICE_KEY'] = VALID_KEY;
    const server = await buildServer({ pool: null, logLevel: 'silent' });

    const response = await server.inject({
      method: 'POST',
      url: '/api/trust/transactions/deposit',
      payload: {},
    });

    expect(response.statusCode).toBe(401);
    const body = response.json<{
      error: { code: string; message: string; timestamp: string; correlationId: string };
    }>();
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe('UNAUTHORIZED');
    expect(typeof body.error.message).toBe('string');
    await server.close();
    process.env['NODE_ENV'] = 'test';
  });

  it('should passthrough in development mode', async () => {
    process.env['NODE_ENV'] = 'development';
    const server = await buildServer({ pool: null, logLevel: 'silent' });

    const response = await server.inject({
      method: 'GET',
      url: '/api/trust/accounts',
      /* No auth header needed in dev */
    });

    /* Should NOT be 401 — dev mode passes through */
    expect(response.statusCode).not.toBe(401);
    await server.close();
    process.env['NODE_ENV'] = 'test';
  });
});
