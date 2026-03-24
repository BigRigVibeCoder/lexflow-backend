/**
 * @file src/services/ledger-engine.test.ts
 * @description Unit tests for the LedgerEngine class.
 *
 * Tests error handling paths, type exports, and constructor behavior.
 * Drizzle ORM makes full operation mocking fragile — happy-path operations
 * are best covered by integration tests with a real DB.
 *
 * REF: GOV-002 (Testing Protocol)
 * REF: SPR-004 T-038 (Ledger Engine)
 */

import { describe, it, expect, vi } from 'vitest';
import {
  LedgerEngine,
  type DepositParams,
  type DisburseParams,
  type TransferParams,
  type FeeTransferParams,
  type VoidParams,
  type TransactionResult,
  type TransferResult,
  type VoidResult,
  type PaginationParams,
  type PaginatedResult,
  type TransactionType,
} from './ledger-engine.js';
import { ApplicationError, ErrorCategory } from '../lib/errors.js';

/**
 * Create a mock pool where connect() returns a client that throws
 * a specific PG error code on the Nth query call.
 */
function createErrorPool(errorCode: string, errorMessage: string, failAfterCalls = 2) {
  let callCount = 0;
  const mockClient = {
    // eslint-disable-next-line @typescript-eslint/require-await -- mock must return Promise
    query: vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount > failAfterCalls) {
        const err = new Error(errorMessage) as Error & { code: string };
        err.code = errorCode;
        throw err;
      }
      return { rows: [], rowCount: 0 };
    }),
    release: vi.fn(),
  };

  return {
    pool: { connect: vi.fn().mockResolvedValue(mockClient), query: mockClient.query } as unknown as import('pg').Pool,
    mockClient,
  };
}

/**
 * Create a mock pool where connect() itself fails.
 */
function createBrokenPool() {
  return {
    pool: {
      connect: vi.fn().mockRejectedValue(new Error('connection refused')),
      query: vi.fn(),
    } as unknown as import('pg').Pool,
  };
}

/* ────────────────────────────────────────────────────────────────── */

describe('LedgerEngine — Type Exports', () => {
  it('should export all transaction type interfaces', () => {
    /* Verify that the module exports all required types */
    const depositParams: DepositParams = {
      trustAccountId: 'uuid', clientLedgerId: 'uuid', amount: '100.00',
      description: 'test', payorName: 'payor', paymentMethod: 'check', createdByName: 'tester',
    };
    const disburseParams: DisburseParams = {
      trustAccountId: 'uuid', clientLedgerId: 'uuid', amount: '100.00',
      description: 'test', payeeName: 'payee', paymentMethod: 'check', createdByName: 'tester',
    };
    const transferParams: TransferParams = {
      trustAccountId: 'uuid', fromLedgerId: 'uuid', toLedgerId: 'uuid',
      amount: '100.00', description: 'test', createdByName: 'tester',
    };
    const feeParams: FeeTransferParams = {
      trustAccountId: 'uuid', clientLedgerId: 'uuid', operatingAccountId: 'uuid',
      amount: '100.00', description: 'test', createdByName: 'tester',
    };
    const voidParams: VoidParams = {
      entryGroupId: 'uuid', reason: 'test', voidedByName: 'tester',
    };

    expect(depositParams).toBeDefined();
    expect(disburseParams).toBeDefined();
    expect(transferParams).toBeDefined();
    expect(feeParams).toBeDefined();
    expect(voidParams).toBeDefined();
  });

  it('should export result types', () => {
    const txResult = {} as TransactionResult;
    const transferResult = {} as TransferResult;
    const voidResult = {} as VoidResult;
    const pagination = {} as PaginationParams;
    const paginated = {} as PaginatedResult<unknown>;
    const txType: TransactionType = 'deposit';

    expect(txType).toBe('deposit');
    /* Type assertions — these compile = types are correctly exported */
    expect([txResult, transferResult, voidResult, pagination, paginated]).toBeDefined();
  });
});

describe('LedgerEngine — Constructor', () => {
  it('should construct with a valid pool', () => {
    const { pool } = createErrorPool('', '', 999);
    const engine = new LedgerEngine(pool);
    expect(engine).toBeInstanceOf(LedgerEngine);
  });
});

describe('LedgerEngine — Lock Timeout (PG 55P03)', () => {
  it('should throw LEDGER_BUSY on lock timeout', async () => {
    const { pool } = createErrorPool('55P03', 'lock timeout');
    const engine = new LedgerEngine(pool);

    await expect(engine.recordDeposit({
      trustAccountId: '00000000-0000-0000-0000-000000000001',
      clientLedgerId: '00000000-0000-0000-0000-000000000002',
      amount: '100.00',
      description: 'Lock timeout test',
      payorName: 'Client',
      paymentMethod: 'check',
      createdByName: 'Tester',
    })).rejects.toThrow('Ledger is busy');
  });

  it('should wrap lock timeout as ApplicationError', async () => {
    const { pool } = createErrorPool('55P03', 'lock timeout');
    const engine = new LedgerEngine(pool);

    try {
      await engine.recordDeposit({
        trustAccountId: '00000000-0000-0000-0000-000000000001',
        clientLedgerId: '00000000-0000-0000-0000-000000000002',
        amount: '100.00',
        description: 'Lock test',
        payorName: 'Client',
        paymentMethod: 'check',
        createdByName: 'Tester',
      });
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ApplicationError);
      expect((err as ApplicationError).code).toBe('LEDGER_BUSY');
    }
  });
});

describe('LedgerEngine — Serialization Retry (PG 40001)', () => {
  it('should retry on serialization failure and eventually throw', async () => {
    const { pool, mockClient } = createErrorPool('40001', 'could not serialize');
    const engine = new LedgerEngine(pool);

    await expect(engine.recordDeposit({
      trustAccountId: '00000000-0000-0000-0000-000000000001',
      clientLedgerId: '00000000-0000-0000-0000-000000000002',
      amount: '100.00',
      description: 'Serialize test',
      payorName: 'Client',
      paymentMethod: 'check',
      createdByName: 'Tester',
    })).rejects.toThrow();

    /* Should have retried — multiple connect calls */
    expect(mockClient.query.mock.calls.length).toBeGreaterThan(2);
  });
});

describe('LedgerEngine — Connection Failure', () => {
  it('should throw when pool connection fails', async () => {
    const { pool } = createBrokenPool();
    const engine = new LedgerEngine(pool);

    await expect(engine.recordDeposit({
      trustAccountId: '00000000-0000-0000-0000-000000000001',
      clientLedgerId: '00000000-0000-0000-0000-000000000002',
      amount: '100.00',
      description: 'Connection test',
      payorName: 'Client',
      paymentMethod: 'check',
      createdByName: 'Tester',
    })).rejects.toThrow('connection refused');
  });
});

describe('ApplicationError', () => {
  it('should carry error code, message, and category', () => {
    const error = new ApplicationError('test error', 'NOT_FOUND', {
      category: ErrorCategory.RESOURCE,
    });

    expect(error.message).toBe('test error');
    expect(error.code).toBe('NOT_FOUND');
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(ApplicationError);
  });

  it('should be throwable and catchable', () => {
    expect(() => {
      throw new ApplicationError('fail', 'VALIDATION_ERROR', {
        category: ErrorCategory.VALIDATION,
      });
    }).toThrow(ApplicationError);
  });

  it('should preserve stack trace', () => {
    const error = new ApplicationError('stack test', 'INTERNAL_ERROR', {
      category: ErrorCategory.UNKNOWN,
    });
    expect(error.stack).toBeDefined();
    expect(error.stack).toContain('stack test');
  });
});
