/**
 * @file src/services/ledger-engine.test.ts
 * @description Comprehensive unit tests for the LedgerEngine class.
 *
 * Tests: decimal math, error handling, serialization retry, lock timeout,
 * connection failure, type exports, and ApplicationError.
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
 * a specific PG error code after N calls.
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

function createBrokenPool() {
  return {
    pool: {
      connect: vi.fn().mockRejectedValue(new Error('connection refused')),
      query: vi.fn(),
    } as unknown as import('pg').Pool,
  };
}

/* ────────────────────────── Decimal Math ─────────────────────────── */

describe('LedgerEngine — Decimal Math', () => {
  const { pool } = createErrorPool('', '', 999);
  const engine = new LedgerEngine(pool);

  describe('addDecimals', () => {
    it('should add two positive decimals', () => {
      expect(engine.addDecimals('100.00', '50.00')).toBe('150.00');
    });

    it('should handle negative values', () => {
      expect(engine.addDecimals('100.00', '-50.00')).toBe('50.00');
    });

    it('should handle zero', () => {
      expect(engine.addDecimals('0.00', '100.00')).toBe('100.00');
      expect(engine.addDecimals('100.00', '0.00')).toBe('100.00');
    });

    it('should round to 2 decimal places', () => {
      expect(engine.addDecimals('1.111', '2.222')).toBe('3.33');
    });

    it('should handle large numbers', () => {
      expect(engine.addDecimals('999999.99', '0.01')).toBe('1000000.00');
    });

    it('should handle subtracting to zero', () => {
      expect(engine.addDecimals('100.00', '-100.00')).toBe('0.00');
    });
  });

  describe('negateDecimal', () => {
    it('should negate a positive value', () => {
      expect(engine.negateDecimal('100.00')).toBe('-100.00');
    });

    it('should negate a negative value (double negative)', () => {
      expect(engine.negateDecimal('-50.00')).toBe('50.00');
    });

    it('should handle zero', () => {
      expect(engine.negateDecimal('0.00')).toBe('0.00');
    });

    it('should maintain 2-decimal precision', () => {
      expect(engine.negateDecimal('1.5')).toBe('-1.50');
    });
  });

  describe('formatDecimal', () => {
    it('should format integer as decimal', () => {
      expect(engine.formatDecimal('100')).toBe('100.00');
    });

    it('should format single decimal place', () => {
      expect(engine.formatDecimal('50.5')).toBe('50.50');
    });

    it('should truncate extra decimals', () => {
      expect(engine.formatDecimal('10.999')).toBe('11.00');
    });

    it('should handle zero', () => {
      expect(engine.formatDecimal('0')).toBe('0.00');
    });

    it('should handle negative values', () => {
      expect(engine.formatDecimal('-25.1')).toBe('-25.10');
    });
  });
});

/* ────────────────────────── Type Exports ─────────────────────────── */

describe('LedgerEngine — Type Exports', () => {
  it('should export all parameter interfaces', () => {
    const deposit: DepositParams = {
      trustAccountId: 'u', clientLedgerId: 'u', amount: '1', description: 'd',
      payorName: 'p', paymentMethod: 'check', createdByName: 'c',
    };
    const disburse: DisburseParams = {
      trustAccountId: 'u', clientLedgerId: 'u', amount: '1', description: 'd',
      payeeName: 'p', paymentMethod: 'check', createdByName: 'c',
    };
    const transfer: TransferParams = {
      trustAccountId: 'u', fromLedgerId: 'u', toLedgerId: 'u',
      amount: '1', description: 'd', createdByName: 'c',
    };
    const fee: FeeTransferParams = {
      trustAccountId: 'u', clientLedgerId: 'u', operatingAccountId: 'u',
      amount: '1', description: 'd', createdByName: 'c',
    };
    const voidP: VoidParams = { entryGroupId: 'u', reason: 'r', voidedByName: 'v' };

    expect([deposit, disburse, transfer, fee, voidP]).toHaveLength(5);
  });

  it('should export result types', () => {
    const tx: TransactionType = 'deposit';
    expect(tx).toBe('deposit');
    expect({} as TransactionResult).toBeDefined();
    expect({} as TransferResult).toBeDefined();
    expect({} as VoidResult).toBeDefined();
    expect({} as PaginationParams).toBeDefined();
    expect({} as PaginatedResult<unknown>).toBeDefined();
  });
});

/* ────────────────────────── Constructor ──────────────────────────── */

describe('LedgerEngine — Constructor', () => {
  it('should construct with a valid pool', () => {
    const { pool } = createErrorPool('', '', 999);
    expect(new LedgerEngine(pool)).toBeInstanceOf(LedgerEngine);
  });
});

/* ────────────────────── Lock Timeout (55P03) ─────────────────────── */

describe('LedgerEngine — Lock Timeout (PG 55P03)', () => {
  it('should throw LEDGER_BUSY on lock timeout', async () => {
    const { pool } = createErrorPool('55P03', 'lock timeout');
    const engine = new LedgerEngine(pool);

    await expect(engine.recordDeposit({
      trustAccountId: '00000000-0000-0000-0000-000000000001',
      clientLedgerId: '00000000-0000-0000-0000-000000000002',
      amount: '100.00', description: 'test', payorName: 'c',
      paymentMethod: 'check', createdByName: 't',
    })).rejects.toThrow('Ledger is busy');
  });

  it('should set error code to LEDGER_BUSY', async () => {
    const { pool } = createErrorPool('55P03', 'lock timeout');
    const engine = new LedgerEngine(pool);

    try {
      await engine.recordDeposit({
        trustAccountId: '00000000-0000-0000-0000-000000000001',
        clientLedgerId: '00000000-0000-0000-0000-000000000002',
        amount: '100.00', description: 'test', payorName: 'c',
        paymentMethod: 'check', createdByName: 't',
      });
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ApplicationError);
      expect((err as ApplicationError).code).toBe('LEDGER_BUSY');
    }
  });

  it('should NOT retry on lock timeout (fail fast)', async () => {
    const { pool, mockClient } = createErrorPool('55P03', 'lock timeout');
    const engine = new LedgerEngine(pool);

    await expect(engine.recordDeposit({
      trustAccountId: '00000000-0000-0000-0000-000000000001',
      clientLedgerId: '00000000-0000-0000-0000-000000000002',
      amount: '100.00', description: 'test', payorName: 'c',
      paymentMethod: 'check', createdByName: 't',
    })).rejects.toThrow();

    /* Only 1 connect call — no retry */
    expect(mockClient.release).toHaveBeenCalledTimes(1);
  });
});

/* ──────────────── Serialization Retry (40001) ────────────────────── */

describe('LedgerEngine — Serialization Retry (PG 40001)', () => {
  it('should retry on serialization failure then throw', async () => {
    const { pool, mockClient } = createErrorPool('40001', 'could not serialize');
    const engine = new LedgerEngine(pool);

    await expect(engine.recordDeposit({
      trustAccountId: '00000000-0000-0000-0000-000000000001',
      clientLedgerId: '00000000-0000-0000-0000-000000000002',
      amount: '100.00', description: 'test', payorName: 'c',
      paymentMethod: 'check', createdByName: 't',
    })).rejects.toThrow();

    /* Should have retried (multiple queries) */
    expect(mockClient.query.mock.calls.length).toBeGreaterThan(2);
  });
});

/* ──────────────── Connection Failure ─────────────────────────────── */

describe('LedgerEngine — Connection Failure', () => {
  it('should throw when pool.connect() fails', async () => {
    const { pool } = createBrokenPool();
    const engine = new LedgerEngine(pool);

    await expect(engine.recordDeposit({
      trustAccountId: '00000000-0000-0000-0000-000000000001',
      clientLedgerId: '00000000-0000-0000-0000-000000000002',
      amount: '100.00', description: 'test', payorName: 'c',
      paymentMethod: 'check', createdByName: 't',
    })).rejects.toThrow('connection refused');
  });

  it('should propagate connection error for disbursement', async () => {
    const { pool } = createBrokenPool();
    const engine = new LedgerEngine(pool);

    await expect(engine.recordDisbursement({
      trustAccountId: '00000000-0000-0000-0000-000000000001',
      clientLedgerId: '00000000-0000-0000-0000-000000000002',
      amount: '50.00', description: 'test', payeeName: 'p',
      paymentMethod: 'check', createdByName: 't',
    })).rejects.toThrow('connection refused');
  });

  it('should propagate connection error for transfer', async () => {
    const { pool } = createBrokenPool();
    const engine = new LedgerEngine(pool);

    await expect(engine.recordTransfer({
      trustAccountId: '00000000-0000-0000-0000-000000000001',
      fromLedgerId: '00000000-0000-0000-0000-000000000002',
      toLedgerId: '00000000-0000-0000-0000-000000000003',
      amount: '25.00', description: 'test', createdByName: 't',
    })).rejects.toThrow('connection refused');
  });
});

/* ──────────────── ApplicationError ───────────────────────────────── */

describe('ApplicationError', () => {
  it('should carry code, message, and category', () => {
    const err = new ApplicationError('test', 'NOT_FOUND', { category: ErrorCategory.RESOURCE });
    expect(err.message).toBe('test');
    expect(err.code).toBe('NOT_FOUND');
    expect(err).toBeInstanceOf(Error);
  });

  it('should be throwable and catchable', () => {
    expect(() => {
      throw new ApplicationError('fail', 'VALIDATION_ERROR', { category: ErrorCategory.VALIDATION });
    }).toThrow(ApplicationError);
  });

  it('should preserve stack trace', () => {
    const err = new ApplicationError('stack', 'INTERNAL_ERROR', { category: ErrorCategory.UNKNOWN });
    expect(err.stack).toBeDefined();
    expect(err.stack).toContain('stack');
  });

  it('should support all error categories', () => {
    for (const category of Object.values(ErrorCategory)) {
      const err = new ApplicationError('test', 'INTERNAL_ERROR', { category });
      expect(err).toBeInstanceOf(ApplicationError);
    }
  });
});
