/**
 * @file src/routes/transactions.ts
 * @description Transaction routes — deposit, disburse, transfer, fee-transfer, void.
 *
 * All operations use the LedgerEngine with advisory locks and SERIALIZABLE isolation.
 *
 * REF: CON-002 §3.1-3.5
 * REF: SPR-004 T-040, T-041, T-042, T-043, T-045
 */

import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { LedgerEngine } from '../services/ledger-engine.js';
import { ApplicationError, ErrorCategory } from '../lib/errors.js';
import type { DepositRequest, DisburseRequest, TransferRequest, FeeTransferRequest, VoidRequest, VoidParams } from '../schemas/transactions.js';
import {
  DepositRequestSchema,
  DisburseRequestSchema,
  TransferRequestSchema,
  FeeTransferRequestSchema,
  VoidRequestSchema,
  VoidParamsSchema,
} from '../schemas/transactions.js';

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
async function transactionRoutes(fastify: FastifyInstance): Promise<void> {

  /**
   * POST /api/trust/transactions/deposit
   * REF: CON-002 §3.1
   */
  fastify.post<{ Body: DepositRequest }>(
    '/api/trust/transactions/deposit',
    { schema: { body: DepositRequestSchema } },
    async (request, reply) => {
      const engine = getEngine(fastify.pool);
      const result = await engine.recordDeposit(request.body);

      request.log.info({
        event: 'trust.transaction',
        transactionType: 'deposit',
        entryId: result.entryId,
        trustAccountId: request.body.trustAccountId,
        clientLedgerId: request.body.clientLedgerId,
        amount: request.body.amount,
        createdBy: request.body.createdByName,
        correlationId: request.correlationId,
      }, 'Deposit recorded');

      return reply.status(201).send(result);
    },
  );

  /**
   * POST /api/trust/transactions/disburse
   * REF: CON-002 §3.2
   */
  fastify.post<{ Body: DisburseRequest }>(
    '/api/trust/transactions/disburse',
    { schema: { body: DisburseRequestSchema } },
    async (request, reply) => {
      const engine = getEngine(fastify.pool);
      const result = await engine.recordDisbursement(request.body);

      request.log.info({
        event: 'trust.transaction',
        transactionType: 'disbursement',
        entryId: result.entryId,
        trustAccountId: request.body.trustAccountId,
        clientLedgerId: request.body.clientLedgerId,
        amount: request.body.amount,
        createdBy: request.body.createdByName,
        correlationId: request.correlationId,
      }, 'Disbursement recorded');

      return reply.status(201).send(result);
    },
  );

  /**
   * POST /api/trust/transactions/transfer
   * REF: CON-002 §3.3
   */
  fastify.post<{ Body: TransferRequest }>(
    '/api/trust/transactions/transfer',
    { schema: { body: TransferRequestSchema } },
    async (request, reply) => {
      const engine = getEngine(fastify.pool);
      const result = await engine.recordTransfer(request.body);

      request.log.info({
        event: 'trust.transaction',
        transactionType: 'transfer',
        entryId: result.entryId,
        trustAccountId: request.body.trustAccountId,
        fromLedgerId: request.body.fromLedgerId,
        toLedgerId: request.body.toLedgerId,
        amount: request.body.amount,
        createdBy: request.body.createdByName,
        correlationId: request.correlationId,
      }, 'Transfer recorded');

      return reply.status(201).send(result);
    },
  );

  /**
   * POST /api/trust/transactions/fee-transfer
   * REF: CON-002 §3.4
   */
  fastify.post<{ Body: FeeTransferRequest }>(
    '/api/trust/transactions/fee-transfer',
    { schema: { body: FeeTransferRequestSchema } },
    async (request, reply) => {
      const engine = getEngine(fastify.pool);
      const result = await engine.recordFeeTransfer(request.body);

      request.log.info({
        event: 'trust.transaction',
        transactionType: 'fee_transfer',
        entryId: result.entryId,
        trustAccountId: request.body.trustAccountId,
        clientLedgerId: request.body.clientLedgerId,
        amount: request.body.amount,
        createdBy: request.body.createdByName,
        correlationId: request.correlationId,
      }, 'Fee transfer recorded');

      return reply.status(201).send(result);
    },
  );

  /**
   * POST /api/trust/transactions/:entryId/void
   * REF: CON-002 §3.5
   */
  fastify.post<{ Params: VoidParams; Body: VoidRequest }>(
    '/api/trust/transactions/:entryId/void',
    { schema: { params: VoidParamsSchema, body: VoidRequestSchema } },
    async (request, reply) => {
      const engine = getEngine(fastify.pool);
      const result = await engine.voidEntry({
        entryGroupId: request.params.entryId,
        reason: request.body.reason,
        voidedByName: request.body.voidedByName,
      });

      request.log.info({
        event: 'trust.transaction',
        transactionType: 'void',
        voidEntryId: result.voidEntryId,
        originalEntryId: result.originalEntryId,
        correlationId: request.correlationId,
      }, 'Entry voided');

      return reply.status(201).send(result);
    },
  );
}

export default transactionRoutes;

