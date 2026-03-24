/**
 * @file src/routes/health.test.ts
 * @description Unit tests for the health endpoint.
 *
 * REF: GOV-002 (Testing Protocol)
 * REF: CON-002 §1.1 (GET /health response shape)
 */

import { describe, it, expect } from 'vitest';
import { buildServer } from '../server.js';

describe('GET /health', () => {
  it('should return 200 with status, uptimeMs, and dbConnected', async () => {
    const server = await buildServer({ pool: null, logLevel: 'silent' });

    const response = await server.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);

    const body = response.json<{ status: string; uptimeMs: number; dbConnected: boolean }>();

    /* Assert: Response matches CON-002 §1.1 schema */
    expect(body.status).toBe('ok');
    expect(typeof body.uptimeMs).toBe('number');
    expect(body.uptimeMs).toBeGreaterThanOrEqual(0);
    expect(body.dbConnected).toBe(false); // No pool provided

    await server.close();
  });

  it('should not require authentication', async () => {
    const server = await buildServer({ pool: null, logLevel: 'silent' });

    /* Assert: No X-Internal-Service-Key header needed */
    const response = await server.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);

    await server.close();
  });

  it('should include X-Correlation-ID in response headers', async () => {
    const server = await buildServer({ pool: null, logLevel: 'silent' });

    const response = await server.inject({
      method: 'GET',
      url: '/health',
    });

    /* Assert: Correlation ID plugin is registered and working */
    const correlationId = response.headers['x-correlation-id'];
    expect(correlationId).toBeDefined();
    expect(typeof correlationId).toBe('string');

    await server.close();
  });
});
