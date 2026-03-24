/**
 * @file src/plugins/auth.ts
 * @description Internal service authentication middleware.
 *
 * Validates `X-Internal-Service-Key` header on all routes except /health.
 * In development mode (NODE_ENV=development), auth is bypassed for testing.
 *
 * REF: CON-001 §1.2 (Shared secret auth)
 * REF: CON-002 §2 (Auth on all trust routes)
 * REF: SPR-004 T-035V
 */

import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { ApplicationError, ErrorCategory } from '../lib/errors.js';

const AUTH_HEADER = 'x-internal-service-key';
const EXEMPT_PATHS = new Set(['/health']);

/**
 * Fastify auth plugin — validates internal service key.
 *
 * PRECONDITION: INTERNAL_SERVICE_KEY env var must be set in production.
 * POSTCONDITION: Unauthorized requests receive 401 before reaching route handlers.
 * FAILURE MODE: If INTERNAL_SERVICE_KEY is not set in production, ALL requests are rejected.
 */
// eslint-disable-next-line @typescript-eslint/require-await -- Fastify plugin registration requires async
async function authPlugin(fastify: FastifyInstance): Promise<void> {
  const serviceKey = process.env['INTERNAL_SERVICE_KEY'];
  const isDev = process.env['NODE_ENV'] === 'development';

  if (!serviceKey && !isDev) {
    fastify.log.warn('INTERNAL_SERVICE_KEY not set — all requests will be rejected');
  }

  // eslint-disable-next-line @typescript-eslint/require-await -- Fastify hook requires async signature
  fastify.addHook('onRequest', async (request) => {
    /* Skip auth for exempt paths (health endpoint) */
    if (EXEMPT_PATHS.has(request.url)) {
      return;
    }

    /* Development mode: passthrough for testing */
    if (isDev) {
      return;
    }

    const providedKey = request.headers[AUTH_HEADER];

    if (!providedKey || providedKey !== serviceKey) {
      throw new ApplicationError(
        'Invalid or missing service key',
        'UNAUTHORIZED',
        {
          category: ErrorCategory.SECURITY,
          operation: 'auth.validate',
          component: 'auth-plugin',
          correlationId: request.correlationId,
        },
      );
    }
  });
}

export default fp(authPlugin, {
  name: 'auth',
  fastify: '4.x',
  dependencies: ['correlation-id'],
});
