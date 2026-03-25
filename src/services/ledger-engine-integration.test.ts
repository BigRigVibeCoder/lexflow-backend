/**
 * @file src/services/ledger-engine-integration.test.ts
 * @description Integration-style tests for LedgerEngine operations.
 *
 * Uses sequential mock with Drizzle-compatible array row format (rowMode: "array").
 * Drizzle sends parameterized queries with rowMode: "array" and maps array indices
 * back to camelCase column names using its schema definitions.
 *
 * REF: GOV-002 (Testing Protocol)
 * REF: SPR-004 T-038 (Ledger Engine)
 */

import { describe, it, expect, vi } from 'vitest';
import { LedgerEngine } from './ledger-engine.js';

/**
 * Response format for mock queries. Supports both object rows (raw SQL)
 * and array rows (Drizzle ORM's rowMode: "array").
 */
interface MockResponse {
  rows: unknown[];
  rowCount: number;
}

/**
 * Client ledger row as array matching Drizzle's SELECT column order:
 * id, trust_account_id, matter_id, client_id, matter_number, client_name, status, created_at, updated_at
 */
function ledgerArrayRow(
  id = '20000000-0000-0000-0000-000000000001',
  trustAccountId = '10000000-0000-0000-0000-000000000001',
): unknown[] {
  return [
    id,                // id
    trustAccountId,    // trust_account_id
    '30000000-0000-0000-0000-000000000001', // matter_id
    '40000000-0000-0000-0000-000000000001', // client_id
    'TEST-001',        // matter_number
    'Test Client',     // client_name
    'active',          // status
    new Date('2026-01-01'), // created_at
    new Date('2026-01-01'), // updated_at
  ];
}

/**
 * Journal entry row as array matching Drizzle's SELECT column order:
 * id, entry_group_id, trust_account_id, client_ledger_id, transaction_type,
 * amount, running_balance, description, reference_number, payor_payee_name,
 * payment_method, matter_name, client_name, created_by_name, is_voided,
 * voided_by_entry_id, voided_by_name, voided_at, void_reason, created_at, updated_at
 */
function journalEntryArrayRow(): unknown[] {
  return [
    '50000000-0000-0000-0000-000000000001', // id
    '60000000-0000-0000-0000-000000000001', // entry_group_id
    '10000000-0000-0000-0000-000000000001', // trust_account_id
    '20000000-0000-0000-0000-000000000001', // client_ledger_id
    'deposit',         // transaction_type
    '1000.00',         // amount
    '1000.00',         // running_balance
    'Test deposit',    // description
    null,              // reference_number
    'Test Payor',      // payor_payee_name
    'check',           // payment_method
    'TEST-001',        // matter_name
    'Test Client',     // client_name
    'Admin',           // created_by_name
    false,             // is_voided
    null,              // voided_by_entry_id
    null,              // voided_by_name
    null,              // voided_at
    null,              // void_reason
    new Date('2026-01-15'), // created_at
  ];
}

/**
 * Create a mock pool where client.query handles both Drizzle (rowMode: "array")
 * and raw SQL (object rows) via sequential responses.
 *
 * Detects rowMode from the query input and converts responses accordingly.
 */
function createSequentialMockPool(responses: MockResponse[]) {
  const releaseFn = vi.fn();
  let callIndex = 0;

  const queryFn = vi.fn().mockImplementation(
    (queryInput: string | { text: string; rowMode?: string; values?: unknown[] }) => {
      const response = responses[callIndex] ?? { rows: [], rowCount: 0 };
      callIndex++;

      // Drizzle sends {text, rowMode: "array"} — rows must be arrays
      // Raw SQL sends plain strings — rows are objects
      const isArrayMode = typeof queryInput !== 'string' && queryInput.rowMode === 'array';

      if (isArrayMode && response.rows.length > 0 && !Array.isArray(response.rows[0])) {
        // Convert object rows to array rows (values only)
        const arrayRows = response.rows.map(row => Object.values(row as Record<string, unknown>));
        return Promise.resolve({ rows: arrayRows, rowCount: response.rowCount });
      }

      return Promise.resolve(response);
    },
  );

  const mockClient = { query: queryFn, release: releaseFn };
  const connectFn = vi.fn().mockImplementation(() => {
    callIndex = 0;
    return Promise.resolve(mockClient);
  });

  const pool = { connect: connectFn, query: queryFn } as unknown as import('pg').Pool;
  return { pool, queryFn, connectFn, releaseFn, mockClient };
}

/** Standard empty response */
const EMPTY: MockResponse = { rows: [], rowCount: 0 };

/** Balance response (used by raw SQL, object format) */
function balanceRow(amount: string): MockResponse {
  return { rows: [{ balance: amount }], rowCount: 1 };
}

/** Ledger row response (Drizzle will get array-converted if rowMode=array) */
function ledgerResponse(): MockResponse {
  return { rows: [ledgerArrayRow()], rowCount: 1 };
}

function ledgerResponse2(): MockResponse {
  return { rows: [ledgerArrayRow('20000000-0000-0000-0000-000000000002')], rowCount: 1 };
}

function entryResponse(): MockResponse {
  return { rows: [journalEntryArrayRow()], rowCount: 1 };
}

/**
 * Deposit query sequence:
 * 0: BEGIN, 1: SET lock_timeout, 2: SELECT client_ledgers (Drizzle),
 * 3: pg_advisory_xact_lock, 4: SELECT balance, 5: INSERT, 6: SELECT trust balance, 7: COMMIT
 */
function depositSequence(ledgerBalance = '5000.00', trustBalance = '10000.00'): MockResponse[] {
  return [
    EMPTY,                                                    // BEGIN
    EMPTY,                                                    // SET LOCAL lock_timeout
    ledgerResponse(),                                         // SELECT client_ledgers (Drizzle → array)
    { rows: [{ pg_advisory_xact_lock: '' }], rowCount: 1 },  // advisory lock
    balanceRow(ledgerBalance),                                // getClientLedgerBalanceRaw
    EMPTY,                                                    // INSERT journal_entries
    balanceRow(trustBalance),                                 // getTrustAccountBalanceRaw
    EMPTY,                                                    // COMMIT
  ];
}

function transferSequence(fromBalance = '5000.00'): MockResponse[] {
  return [
    EMPTY,                                                    // BEGIN
    EMPTY,                                                    // SET LOCAL lock_timeout
    ledgerResponse(),                                         // SELECT client_ledgers (from)
    ledgerResponse2(),                                        // SELECT client_ledgers (to)
    { rows: [{ pg_advisory_xact_lock: '' }], rowCount: 1 },  // lock 1
    { rows: [{ pg_advisory_xact_lock: '' }], rowCount: 1 },  // lock 2
    balanceRow(fromBalance),                                  // from balance
    balanceRow('3000.00'),                                    // to balance
    EMPTY,                                                    // INSERT transfer_out
    EMPTY,                                                    // INSERT transfer_in
    EMPTY,                                                    // COMMIT
  ];
}

function voidSequence(): MockResponse[] {
  return [
    EMPTY,                                                    // BEGIN
    EMPTY,                                                    // SET LOCAL lock_timeout
    entryResponse(),                                          // SELECT journal_entries (Drizzle → array)
    { rows: [{ pg_advisory_xact_lock: '' }], rowCount: 1 },  // advisory lock
    balanceRow('1000.00'),                                    // current balance for reversal
    EMPTY,                                                    // INSERT void entry
    EMPTY,                                                    // UPDATE original entries
    balanceRow('0.00'),                                       // trust balance
    balanceRow('0.00'),                                       // ledger balance
    EMPTY,                                                    // COMMIT
  ];
}

/* ═══════════════════════════════════════════════════════════════════════
 * Deposit — Happy Path
 * ═══════════════════════════════════════════════════════════════════ */

describe('LedgerEngine — recordDeposit (Happy Path)', () => {
  it('should record a deposit and return transaction result', async () => {
    const { pool } = createSequentialMockPool(depositSequence());
    const engine = new LedgerEngine(pool);

    const result = await engine.recordDeposit({
      trustAccountId: '10000000-0000-0000-0000-000000000001',
      clientLedgerId: '20000000-0000-0000-0000-000000000001',
      amount: '1000.00',
      description: 'Retainer deposit',
      payorName: 'John Doe',
      paymentMethod: 'check',
      createdByName: 'Admin',
    });

    expect(result).toHaveProperty('entryId');
    expect(result).toHaveProperty('trustAccountBalance');
    expect(result).toHaveProperty('clientLedgerBalance');
    expect(result).toHaveProperty('createdAt');
    expect(result.clientLedgerBalance).toBe('6000.00');
    expect(result.trustAccountBalance).toBe('10000.00');
  });

  it('should use SERIALIZABLE isolation', async () => {
    const { pool, mockClient } = createSequentialMockPool(depositSequence());
    const engine = new LedgerEngine(pool);

    await engine.recordDeposit({
      trustAccountId: '10000000-0000-0000-0000-000000000001',
      clientLedgerId: '20000000-0000-0000-0000-000000000001',
      amount: '500.00',
      description: 'Test',
      payorName: 'Test',
      paymentMethod: 'wire',
      createdByName: 'Test',
    });

    const calls = mockClient.query.mock.calls.map(
      (c: unknown[]) => (typeof c[0] === 'string' ? c[0] : (c[0] as { text: string }).text),
    );
    expect(calls.some((c: string) => c.includes('BEGIN ISOLATION LEVEL SERIALIZABLE'))).toBe(true);
    expect(calls.some((c: string) => c.includes('COMMIT'))).toBe(true);
  });

  it('should handle optional referenceNumber', async () => {
    const { pool } = createSequentialMockPool(depositSequence());
    const engine = new LedgerEngine(pool);

    const result = await engine.recordDeposit({
      trustAccountId: '10000000-0000-0000-0000-000000000001',
      clientLedgerId: '20000000-0000-0000-0000-000000000001',
      amount: '100.00',
      description: 'With ref',
      payorName: 'Jane',
      paymentMethod: 'ach',
      referenceNumber: 'REF-12345',
      createdByName: 'Admin',
    });

    expect(result).toHaveProperty('entryId');
  });
});

/* ═══════════════════════════════════════════════════════════════════════
 * Disbursement
 * ═══════════════════════════════════════════════════════════════════ */

describe('LedgerEngine — recordDisbursement', () => {
  it('should disburse when balance is sufficient', async () => {
    const { pool } = createSequentialMockPool(depositSequence('5000.00'));
    const engine = new LedgerEngine(pool);

    const result = await engine.recordDisbursement({
      trustAccountId: '10000000-0000-0000-0000-000000000001',
      clientLedgerId: '20000000-0000-0000-0000-000000000001',
      amount: '2000.00',
      description: 'Court filing fee',
      payeeName: 'Superior Court',
      paymentMethod: 'check',
      createdByName: 'Admin',
    });

    expect(result).toHaveProperty('entryId');
    expect(result.clientLedgerBalance).toBe('3000.00');
  });

  it('should reject disbursement when balance is insufficient', async () => {
    const { pool } = createSequentialMockPool(depositSequence('100.00'));
    const engine = new LedgerEngine(pool);

    await expect(engine.recordDisbursement({
      trustAccountId: '10000000-0000-0000-0000-000000000001',
      clientLedgerId: '20000000-0000-0000-0000-000000000001',
      amount: '500.00',
      description: 'Too much',
      payeeName: 'Someone',
      paymentMethod: 'wire',
      createdByName: 'Admin',
    })).rejects.toThrow('Insufficient balance');
  });
});

/* ═══════════════════════════════════════════════════════════════════════
 * Transfer
 * ═══════════════════════════════════════════════════════════════════ */

describe('LedgerEngine — recordTransfer', () => {
  it('should transfer between two ledgers', async () => {
    const { pool } = createSequentialMockPool(transferSequence('3000.00'));
    const engine = new LedgerEngine(pool);

    const result = await engine.recordTransfer({
      trustAccountId: '10000000-0000-0000-0000-000000000001',
      fromLedgerId: '20000000-0000-0000-0000-000000000001',
      toLedgerId: '20000000-0000-0000-0000-000000000002',
      amount: '1500.00',
      description: 'Client-to-client transfer',
      createdByName: 'Admin',
    });

    expect(result).toHaveProperty('entryId');
    expect(result).toHaveProperty('fromLedgerBalance');
    expect(result).toHaveProperty('toLedgerBalance');
    expect(result).toHaveProperty('createdAt');
  });

  it('should reject transfer when source has insufficient balance', async () => {
    const { pool } = createSequentialMockPool(transferSequence('50.00'));
    const engine = new LedgerEngine(pool);

    await expect(engine.recordTransfer({
      trustAccountId: '10000000-0000-0000-0000-000000000001',
      fromLedgerId: '20000000-0000-0000-0000-000000000001',
      toLedgerId: '20000000-0000-0000-0000-000000000002',
      amount: '1000.00',
      description: 'Too much',
      createdByName: 'Admin',
    })).rejects.toThrow('Insufficient balance');
  });
});

/* ═══════════════════════════════════════════════════════════════════════
 * Fee Transfer
 * ═══════════════════════════════════════════════════════════════════ */

describe('LedgerEngine — recordFeeTransfer', () => {
  it('should record fee transfer', async () => {
    const { pool } = createSequentialMockPool(depositSequence('5000.00'));
    const engine = new LedgerEngine(pool);

    const result = await engine.recordFeeTransfer({
      trustAccountId: '10000000-0000-0000-0000-000000000001',
      clientLedgerId: '20000000-0000-0000-0000-000000000001',
      operatingAccountId: '10000000-0000-0000-0000-000000000002',
      amount: '500.00',
      description: 'Legal services fee',
      invoiceReference: 'INV-001',
      createdByName: 'Admin',
    });

    expect(result).toHaveProperty('entryId');
    expect(result).toHaveProperty('clientLedgerBalance');
    expect(result).toHaveProperty('trustAccountBalance');
    expect(result.clientLedgerBalance).toBe('4500.00');
  });

  it('should reject fee transfer when balance is insufficient', async () => {
    const { pool } = createSequentialMockPool(depositSequence('10.00'));
    const engine = new LedgerEngine(pool);

    await expect(engine.recordFeeTransfer({
      trustAccountId: '10000000-0000-0000-0000-000000000001',
      clientLedgerId: '20000000-0000-0000-0000-000000000001',
      operatingAccountId: '10000000-0000-0000-0000-000000000002',
      amount: '500.00',
      description: 'Fee',
      createdByName: 'Admin',
    })).rejects.toThrow('Insufficient balance');
  });
});

/* ═══════════════════════════════════════════════════════════════════════
 * Void
 * ═══════════════════════════════════════════════════════════════════ */

describe('LedgerEngine — voidEntry', () => {
  it('should void an existing entry', async () => {
    const { pool } = createSequentialMockPool(voidSequence());
    const engine = new LedgerEngine(pool);

    const result = await engine.voidEntry({
      entryGroupId: '60000000-0000-0000-0000-000000000001',
      reason: 'Entered in error',
      voidedByName: 'Admin',
    });

    expect(result).toHaveProperty('voidEntryId');
    expect(result).toHaveProperty('originalEntryId');
    expect(result).toHaveProperty('trustAccountBalance');
    expect(result).toHaveProperty('clientLedgerBalance');
    expect(result).toHaveProperty('voidedAt');
  });
});

/* ═══════════════════════════════════════════════════════════════════════
 * Balance & Query Methods
 * ═══════════════════════════════════════════════════════════════════ */

describe('LedgerEngine — getClientLedgerBalance', () => {
  it('should return formatted balance', async () => {
    const { pool } = createSequentialMockPool([balanceRow('12345.67')]);
    const engine = new LedgerEngine(pool);
    const balance = await engine.getClientLedgerBalance('20000000-0000-0000-0000-000000000001');
    expect(balance).toBe('12345.67');
  });

  it('should return 0.00 for empty ledger', async () => {
    const { pool } = createSequentialMockPool([balanceRow('0')]);
    const engine = new LedgerEngine(pool);
    const balance = await engine.getClientLedgerBalance('20000000-0000-0000-0000-000000000001');
    expect(balance).toBe('0.00');
  });
});

describe('LedgerEngine — getLedgerTransactions', () => {
  it('should return paginated results', async () => {
    const { pool } = createSequentialMockPool([
      { rows: [[1]], rowCount: 1 },           // COUNT (Drizzle array mode)
      { rows: [journalEntryArrayRow()], rowCount: 1 }, // SELECT entries (Drizzle array mode)
    ]);
    const engine = new LedgerEngine(pool);

    const result = await engine.getLedgerTransactions('20000000-0000-0000-0000-000000000001', {
      page: 1,
      pageSize: 50,
    });

    expect(result).toHaveProperty('data');
    expect(result).toHaveProperty('pagination');
    expect(result.pagination.page).toBe(1);
    expect(result.pagination.pageSize).toBe(50);
  });

  it('should handle date range filters', async () => {
    const { pool } = createSequentialMockPool([
      { rows: [[0]], rowCount: 1 },
      { rows: [], rowCount: 0 },
    ]);
    const engine = new LedgerEngine(pool);

    const result = await engine.getLedgerTransactions('20000000-0000-0000-0000-000000000001', {
      page: 1,
      pageSize: 10,
      startDate: '2026-01-01',
      endDate: '2026-01-31',
    });

    expect(result).toHaveProperty('data');
    expect(result).toHaveProperty('pagination');
  });
});

describe('LedgerEngine — getTransactionDetail', () => {
  it('should return transaction detail', async () => {
    const { pool } = createSequentialMockPool([
      { rows: [journalEntryArrayRow()], rowCount: 1 },
    ]);
    const engine = new LedgerEngine(pool);

    const result = await engine.getTransactionDetail('60000000-0000-0000-0000-000000000001');
    expect(result).toBeDefined();
    expect(result).toHaveProperty('id');
    expect(result).toHaveProperty('transactionType');
    expect(result).toHaveProperty('createdAt');
  });

  it('should throw NOT_FOUND for missing entry', async () => {
    const { pool } = createSequentialMockPool([
      { rows: [], rowCount: 0 },
    ]);
    const engine = new LedgerEngine(pool);

    await expect(
      engine.getTransactionDetail('99999999-0000-0000-0000-000000000001'),
    ).rejects.toThrow('not found');
  });
});
