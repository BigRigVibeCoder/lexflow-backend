/**
 * @file src/test-helpers/mock-pool.ts
 * @description Reusable mock PostgreSQL pool for unit testing routes.
 *
 * Provides a configurable mock pool that handles both Drizzle ORM queries
 * (which use pool.query) and raw SQL (which uses pool.connect → client.query).
 *
 * REF: GOV-002 (Testing Protocol)
 */

import { vi } from 'vitest';
import type pg from 'pg';

/**
 * Row data that can be returned from mock queries.
 */
type MockRow = Record<string, unknown>;

/**
 * Configuration for the mock pool.
 */
export interface MockPoolConfig {
  /** Default rows returned by queries. */
  defaultRows?: MockRow[];
  /** Map of SQL pattern → rows to return when matched. */
  queryResponses?: Map<string, MockRow[]>;
  /** If true, connect() rejects (simulates DB down). */
  connectionError?: boolean;
}

/**
 * Result from createMockPool — includes the pool and spies.
 */
export interface MockPoolResult {
  pool: pg.Pool;
  queryFn: ReturnType<typeof vi.fn>;
  connectFn: ReturnType<typeof vi.fn>;
  releaseFn: ReturnType<typeof vi.fn>;
}

/**
 * Create a mock pool that returns configured responses.
 *
 * Drizzle uses pool.query() directly.
 * Raw SQL uses pool.connect() → client.query().
 * This mock supports both patterns.
 */
export function createMockPool(config: MockPoolConfig = {}): MockPoolResult {
  const {
    defaultRows = [],
    queryResponses = new Map(),
    connectionError = false,
  } = config;

  const releaseFn = vi.fn();

  /**
   * Match a SQL query to configured responses.
   */
  function resolveQuery(queryText: string): { rows: MockRow[]; rowCount: number } {
    for (const [pattern, rows] of queryResponses.entries()) {
      if (queryText.toLowerCase().includes(pattern.toLowerCase())) {
        return { rows, rowCount: rows.length };
      }
    }
    return { rows: defaultRows, rowCount: defaultRows.length };
  }

  const queryFn = vi.fn().mockImplementation(
    (queryInput: string | { text: string }) => {
      const text = typeof queryInput === 'string' ? queryInput : queryInput.text;
      return Promise.resolve(resolveQuery(text));
    },
  );

  const mockClient = {
    query: queryFn,
    release: releaseFn,
  };

  const connectFn = connectionError
    ? vi.fn().mockRejectedValue(new Error('connection refused'))
    : vi.fn().mockResolvedValue(mockClient);

  const pool = {
    connect: connectFn,
    query: queryFn,
    end: vi.fn().mockResolvedValue(undefined),
  } as unknown as pg.Pool;

  return { pool, queryFn, connectFn, releaseFn };
}

/**
 * Shorthand: pool that returns empty results for everything.
 */
export function createEmptyMockPool(): MockPoolResult {
  return createMockPool();
}

/**
 * Shorthand: pool that simulates a trust account existing.
 */
export function createMockPoolWithAccount(
  accountOverrides?: Partial<MockRow>,
): MockPoolResult {
  const account = {
    id: '10000000-0000-0000-0000-000000000001',
    bank_name: 'Test Bank',
    account_number: '****1234',
    routing_number: '021000021',
    account_name: 'Test IOLTA',
    account_type: 'iolta',
    status: 'active',
    created_at: new Date('2026-01-01'),
    ...accountOverrides,
  };

  const drizzleAccount = {
    id: account.id,
    bankName: account.bank_name,
    accountNumber: account.account_number,
    routingNumber: account.routing_number,
    accountName: account.account_name,
    accountType: account.account_type,
    status: account.status,
    createdAt: account.created_at,
  };

  return createMockPool({
    defaultRows: [drizzleAccount],
    queryResponses: new Map([
      ['insert into', [drizzleAccount]],
      ['trust_accounts', [drizzleAccount]],
      ['coalesce(sum', [{ balance: '0.00' }]],
      ['count', [{ value: 0 }]],
    ]),
  });
}

/**
 * Shorthand: pool that has a trust account and a client ledger.
 */
export function createMockPoolWithLedger(
  ledgerOverrides?: Partial<MockRow>,
): MockPoolResult {
  const account = {
    id: '10000000-0000-0000-0000-000000000001',
    bankName: 'Test Bank',
    accountNumber: '****1234',
    routingNumber: '021000021',
    accountName: 'Test IOLTA',
    accountType: 'iolta',
    status: 'active',
    createdAt: new Date('2026-01-01'),
  };

  const ledger = {
    id: '20000000-0000-0000-0000-000000000001',
    trustAccountId: account.id,
    matterId: '30000000-0000-0000-0000-000000000001',
    clientId: '40000000-0000-0000-0000-000000000001',
    matterNumber: 'TEST-001',
    clientName: 'Test Client',
    status: 'active',
    createdAt: new Date('2026-01-01'),
    ...ledgerOverrides,
  };

  return createMockPool({
    defaultRows: [account],
    queryResponses: new Map([
      ['trust_accounts', [account]],
      ['client_ledgers', [ledger]],
      ['insert into', [ledger]],
      ['coalesce(sum', [{ balance: '5000.00' }]],
      ['count', [{ value: 1 }]],
    ]),
  });
}
