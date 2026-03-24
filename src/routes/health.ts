/**
 * @file src/routes/health.ts
 * @description Health check endpoint for the Trust Service.
 *
 * Returns service status, uptime, and database connectivity.
 * No authentication required per CON-002 §1.1.
 *
 * REF: CON-002 §1.1 (GET /health — response shape)
 * REF: AGT-003-BE §5 (Routes You Implement — /health)
 */

import type { FastifyInstance } from 'fastify';
import { testConnection } from '../db/connection.js';

/** Application start time — used to calculate uptimeMs. */
const START_TIME_MS = Date.now();

/**
 * Register the health check route.
 *
 * PRECONDITION: fastify.pool must be decorated on the Fastify instance.
 * POSTCONDITION: GET /health returns { status, uptimeMs, dbConnected }.
 *
 * @example
 * ```
 * curl http://localhost:4000/health
 * # → { "status": "ok", "uptimeMs": 12345, "dbConnected": true }
 * ```
 */
// eslint-disable-next-line @typescript-eslint/require-await -- Fastify route plugin registration requires async
export default async function healthRoute(fastify: FastifyInstance): Promise<void> {
  fastify.get('/health', async () => {
    const uptimeMs = Date.now() - START_TIME_MS;

    /* Check DB connectivity — returns false on any error, never throws */
    const dbConnected = fastify.pool
      ? await testConnection(fastify.pool)
      : false;

    return {
      status: 'ok' as const,
      uptimeMs,
      dbConnected,
    };
  });
}
