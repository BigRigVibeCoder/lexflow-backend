/**
 * @file src/server.ts
 * @description Fastify application factory for the Trust Service.
 *
 * READING GUIDE FOR INCIDENT RESPONDERS:
 * 1. If the server won't start → check buildServer() and environment config
 * 2. If requests have no correlation IDs → check plugin registration order
 * 3. If errors have wrong shape → check error-handler plugin
 * 4. If DB queries fail → check pool decoration and DATABASE_URL
 *
 * DECISION: Using a factory function (buildServer) instead of a singleton
 * so that tests can create isolated Fastify instances.
 * ALTERNATIVES CONSIDERED: Global singleton (makes testing harder).
 *
 * REF: AGT-003-BE §2 (Technology Stack — Fastify 4)
 * REF: GOV-006 §6.1 (Pino structured logging)
 * REF: GOV-004 §4.2 (Global exception handler)
 */

import Fastify from 'fastify';
import type pg from 'pg';

import correlationIdPlugin from './plugins/correlation-id.js';
import errorHandlerPlugin from './plugins/error-handler.js';
import healthRoute from './routes/health.js';

/**
 * Augment Fastify instance with the PostgreSQL pool.
 * This allows route handlers to access the pool via `fastify.pool`.
 */
declare module 'fastify' {
  interface FastifyInstance {
    pool: pg.Pool | null;
  }
}

/**
 * Server configuration options.
 */
export interface ServerOptions {
  /** PostgreSQL connection pool (null if DB not configured). */
  pool: pg.Pool | null;
  /** Log level — defaults to 'info'. */
  logLevel?: string;
}

/**
 * Build a configured Fastify server instance.
 *
 * Registers plugins in dependency order:
 * 1. correlation-id → generates/propagates request trace IDs
 * 2. error-handler → transforms errors into CON-002 responses
 * 3. health route → GET /health (no auth required)
 *
 * PRECONDITION: pool may be null (health endpoint reports dbConnected=false).
 * POSTCONDITION: Returns a fully configured but NOT started Fastify instance.
 * SIDE EFFECTS: None — call server.listen() to start.
 *
 * @example
 * ```typescript
 * const server = await buildServer({ pool: myPool, logLevel: 'debug' });
 * await server.listen({ port: 4000 });
 * ```
 */
export async function buildServer(options: ServerOptions) {
  const { pool, logLevel = 'info' } = options;

  const server = Fastify({
    logger: {
      level: logLevel,
      /* GOV-006 §6.1: Structured JSON logging via pino */
      formatters: {
        level: (label: string) => ({ level: label.toUpperCase() }),
      },
      timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
      base: {
        service: process.env['SERVICE_NAME'] ?? 'lexflow-trust',
      },
    },
  });

  /* Decorate the instance with the DB pool so routes can access it */
  server.decorate('pool', pool);

  /* Register plugins in dependency order */
  await server.register(correlationIdPlugin);
  await server.register(errorHandlerPlugin);
  await server.register(healthRoute);

  return server;
}
