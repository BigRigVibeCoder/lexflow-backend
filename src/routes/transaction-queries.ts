/**
 * @file src/routes/transaction-queries.ts
 * @description Transaction query routes — ledger history and transaction detail.
 *
 * REF: CON-002 §4.1-4.2
 * REF: SPR-004 T-046
 */

import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { LedgerEngine } from '../services/ledger-engine.js';
import { ApplicationError, ErrorCategory } from '../lib/errors.js';
import type { Static } from '@sinclair/typebox';
import {
  LedgerTransactionsParamsSchema,
  LedgerTransactionsQuerySchema,
  TransactionDetailParamsSchema,
} from '../schemas/transactions.js';

type LedgerTxParams = Static<typeof LedgerTransactionsParamsSchema>;
type LedgerTxQuery = Static<typeof LedgerTransactionsQuerySchema>;
type TxDetailParams = Static<typeof TransactionDetailParamsSchema>;

/**
 * Require pool and return a LedgerEngine instance.
 */
function getEngine(pool: pg.Pool | null): LedgerEngine {
  if (!pool) {
    throw new ApplicationError('Database not available', 'INTERNAL_ERROR', { category: ErrorCategory.DATABASE });
  }
  return new LedgerEngine(pool);
}

// eslint-disable-next-line @typescript-eslint/require-await -- Fastify route plugin
async function transactionQueryRoutes(fastify: FastifyInstance): Promise<void> {

  /**
   * GET /api/trust/ledgers/:id/transactions — Paginated ledger history.
   * REF: CON-002 §4.1
   */
  fastify.get<{ Params: LedgerTxParams; Querystring: LedgerTxQuery }>(
    '/api/trust/ledgers/:id/transactions',
    { schema: { params: LedgerTransactionsParamsSchema, querystring: LedgerTransactionsQuerySchema } },
    async (request) => {
      const engine = getEngine(fastify.pool);
      const { id } = request.params;
      const page = request.query.page ?? 1;
      const pageSize = request.query.pageSize ?? 50;

      const result = await engine.getLedgerTransactions(id, {
        page,
        pageSize,
        startDate: request.query.startDate,
        endDate: request.query.endDate,
      });

      return {
        data: result.data.map(entry => ({
          id: entry.id,
          entryGroupId: entry.entryGroupId,
          transactionType: entry.transactionType,
          amount: entry.amount,
          runningBalance: entry.runningBalance,
          description: entry.description,
          referenceNumber: entry.referenceNumber,
          createdByName: entry.createdByName,
          isVoided: entry.isVoided,
          voidedByName: entry.voidedByName,
          voidedAt: entry.voidedAt?.toISOString() ?? null,
          createdAt: entry.createdAt.toISOString(),
        })),
        pagination: result.pagination,
      };
    },
  );

  /**
   * GET /api/trust/transactions/:id — Transaction detail with line items.
   * REF: CON-002 §4.2
   */
  fastify.get<{ Params: TxDetailParams }>(
    '/api/trust/transactions/:id',
    { schema: { params: TransactionDetailParamsSchema } },
    async (request) => {
      const engine = getEngine(fastify.pool);
      return engine.getTransactionDetail(request.params.id);
    },
  );
}

export default transactionQueryRoutes;

