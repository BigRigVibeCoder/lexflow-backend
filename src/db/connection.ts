/**
 * @file src/db/connection.ts
 * @description PostgreSQL connection pool and Drizzle ORM initialization.
 *
 * READING GUIDE FOR INCIDENT RESPONDERS:
 * 1. If DB connections fail → check DATABASE_URL env var and pool config
 * 2. If queries hang → check pool max size and idle timeout
 * 3. If connection is refused → check PostgreSQL is running on port 5432
 *
 * DECISION: Using pg.Pool directly (not Drizzle's pg driver wrapper) for
 * maximum control over pool settings and health checks.
 * ALTERNATIVES CONSIDERED: Drizzle's built-in pg connector (less control).
 *
 * REF: AGT-003-BE §6 (Database: lexflow_trust on localhost:5432)
 */

import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';

const { Pool } = pg;

/** Maximum connections in the pool. */
const MAX_POOL_SIZE = 10;

/** Idle connection timeout in milliseconds (30 seconds). */
const IDLE_TIMEOUT_MS = 30_000;

/** Connection timeout in milliseconds (5 seconds). */
const CONNECTION_TIMEOUT_MS = 5_000;

/**
 * Create a PostgreSQL connection pool.
 *
 * PRECONDITION: DATABASE_URL must be a valid PostgreSQL connection string.
 * POSTCONDITION: Returns a configured Pool instance (not yet connected).
 * SIDE EFFECTS: None until a query is executed.
 *
 * FAILURE MODE: If DATABASE_URL is missing, the pool will fail on first query.
 * BLAST RADIUS: All database operations will fail.
 * MITIGATION: Health endpoint checks DB connectivity; service logs CRITICAL.
 */
export function createPool(databaseUrl: string): pg.Pool {
  return new Pool({
    connectionString: databaseUrl,
    max: MAX_POOL_SIZE,
    idleTimeoutMillis: IDLE_TIMEOUT_MS,
    connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
  });
}

/**
 * Create a Drizzle ORM instance backed by the given pool.
 *
 * PRECONDITION: pool must be a valid pg.Pool instance.
 * POSTCONDITION: Returns a Drizzle instance ready for queries.
 */
export function createDrizzle(pool: pg.Pool) {
  return drizzle(pool);
}

/**
 * Test database connectivity by executing a simple query.
 *
 * @returns true if the database is reachable, false otherwise.
 *
 * FAILURE MODE: Returns false on any error — does not throw.
 * SEE ALSO: src/routes/health.ts — uses this for the dbConnected field.
 */
export async function testConnection(pool: pg.Pool): Promise<boolean> {
  try {
    const client = await pool.connect();
    try {
      await client.query('SELECT 1');
      return true;
    } finally {
      client.release();
    }
  } catch {
    return false;
  }
}
