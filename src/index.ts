/**
 * @file src/index.ts
 * @description Entry point for the LexFlow Trust Accounting Service.
 *
 * Loads environment, creates the PostgreSQL pool, builds the Fastify server,
 * and starts listening. Installs global exception handlers per GOV-004 §4.2.
 *
 * READING GUIDE FOR INCIDENT RESPONDERS:
 * 1. If the service won't start → check environment variables in .env
 * 2. If DB connection fails → check DATABASE_URL and PostgreSQL status
 * 3. If unhandled errors crash the service → check global handlers below
 *
 * REF: GOV-004 §4.2 (Global exception handlers)
 * REF: AGT-003-BE §2 (Service Port: 4000)
 */

import 'dotenv/config';
import { createPool } from './db/connection.js';
import { buildServer } from './server.js';

/** Default port per AGT-003-BE §1 */
const DEFAULT_PORT = 4000;

/**
 * Start the Trust Service.
 *
 * PRECONDITION: DATABASE_URL environment variable should be set.
 * POSTCONDITION: Fastify server is listening on PORT.
 * FAILURE MODE: If DATABASE_URL is missing, the service starts but
 *   health endpoint reports dbConnected=false.
 */
async function main(): Promise<void> {
  const port = parseInt(process.env['PORT'] ?? String(DEFAULT_PORT), 10);
  const host = '0.0.0.0';
  const logLevel = process.env['LOG_LEVEL'] ?? 'info';
  const databaseUrl = process.env['DATABASE_URL'];

  /* Create DB pool if DATABASE_URL is configured */
  const pool = databaseUrl ? createPool(databaseUrl) : null;

  if (!databaseUrl) {
    /* eslint-disable-next-line no-console -- Startup warning before logger is available */
    console.warn(
      'WARNING: DATABASE_URL not set. Trust Service starting without database connectivity.',
    );
  }

  const server = await buildServer({ pool, logLevel });

  try {
    await server.listen({ port, host });
    server.log.info(
      { port, host, nodeEnv: process.env['NODE_ENV'] },
      'trust-service.started',
    );
  } catch (error: unknown) {
    server.log.fatal({ err: error }, 'trust-service.startup.failed');
    process.exit(1);
  }
}

/* ─── Global Exception Handlers (GOV-004 §4.2) ──────────────────────── */

/**
 * Catch uncaught synchronous exceptions.
 * SAFETY: If we don't catch here, the process exits silently.
 * REF: GOV-004 §4.2
 */
process.on('uncaughtException', (error: Error) => {
  /* eslint-disable-next-line no-console -- Last-resort logging */
  console.error('FATAL: Uncaught exception — process will exit', {
    error: error.message,
    stack: error.stack,
  });
  process.exit(1);
});

/**
 * Catch unhandled promise rejections.
 * SAFETY: Unhandled rejections indicate a missing .catch() or try/catch.
 * REF: GOV-004 §4.2
 */
process.on('unhandledRejection', (reason: unknown) => {
  /* eslint-disable-next-line no-console -- Last-resort logging */
  console.error('FATAL: Unhandled promise rejection — process will exit', {
    reason,
  });
  process.exit(1);
});

/* ─── Start ──────────────────────────────────────────────────────────── */

void main();
