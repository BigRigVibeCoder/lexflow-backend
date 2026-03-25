/**
 * @file src/test-helpers/drizzle-mock-pool.ts
 * @description Drizzle-compatible mock pool that handles rowMode: "array".
 *
 * Drizzle ORM sends `pool.query({ text, rowMode: "array" })` which expects
 * pg to return rows as arrays indexed by SELECT column position. This helper
 * creates a mock pool that handles both Drizzle array mode and raw SQL object
 * mode via a sequential response queue.
 *
 * REF: GOV-002 (Testing Protocol)
 */

import { vi } from 'vitest';
import type pg from 'pg';

/** Standard mock response */
export interface MockResponse {
  rows: unknown[];
  rowCount: number;
  command?: string;
}

/** Standard empty response */
export const EMPTY: MockResponse = { rows: [], rowCount: 0 };

/** Balance response helper (for raw SQL balance queries) */
export function balanceRow(amount: string): MockResponse {
  return { rows: [{ balance: amount }], rowCount: 1 };
}

/** Count response helper (for Drizzle count queries → returns array) */
export function countRow(n: number): MockResponse {
  return { rows: [[n]], rowCount: 1 };
}

/**
 * Trust account row as array matching Drizzle SELECT column order:
 * id, bank_name, account_number, routing_number, account_name, account_type, status, created_at, updated_at
 */
export function trustAccountArrayRow(
  id = '10000000-0000-0000-0000-000000000001',
): unknown[] {
  return [
    id,
    'Test Bank',
    '****1234',
    '021000021',
    'Client Trust Account',
    'iolta',
    'active',
    new Date('2026-01-01'),
    new Date('2026-01-01'),
  ];
}

/**
 * Client ledger row as array matching Drizzle SELECT column order:
 * id, trust_account_id, matter_id, client_id, matter_number, client_name, status, created_at, updated_at
 */
export function clientLedgerArrayRow(
  id = '20000000-0000-0000-0000-000000000001',
): unknown[] {
  return [
    id,
    '10000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000001',
    'TEST-001',
    'Test Client',
    'active',
    new Date('2026-01-01'),
    new Date('2026-01-01'),
  ];
}

/**
 * Create a Drizzle-compatible mock pool with sequential response queue.
 * The pool.query() and client.query() both use the same response queue.
 * Drizzle's rowMode: "array" is automatically detected.
 */
export function createDrizzleMockPool(responses: MockResponse[]) {
  const releaseFn = vi.fn();
  let callIndex = 0;

  const queryFn = vi.fn().mockImplementation(() => {
    const response = responses[callIndex] ?? { rows: [], rowCount: 0 };
    callIndex++;
    return Promise.resolve(response);
  });

  const mockClient = { query: queryFn, release: releaseFn };
  const connectFn = vi.fn().mockResolvedValue(mockClient);

  const pool = {
    connect: connectFn,
    query: queryFn,
  } as unknown as pg.Pool;

  return { pool, queryFn, connectFn, releaseFn, mockClient };
}
