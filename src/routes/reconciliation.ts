/**
 * @file src/routes/reconciliation.ts
 * @description Reconciliation routes — start, get details, three-way report.
 *
 * REF: CON-002 §5.2-5.4
 * REF: SPR-004 T-048
 */

import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { eq, and, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import {
  reconciliationSessions,
  reconciliationMatches,
  bankStatementLines,
  journalEntries,
  clientLedgers,
  trustAccounts,
} from '../db/schema.js';
import { ApplicationError, ErrorCategory } from '../lib/errors.js';
import type { StartReconciliationInput } from '../schemas/transactions.js';
import {
  StartReconciliationSchema,
} from '../schemas/transactions.js';
import { Type, type Static } from '@sinclair/typebox';

const ReconciliationIdParamsSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
});
type ReconciliationIdParams = Static<typeof ReconciliationIdParamsSchema>;

const ThreeWayParamsSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
});
type ThreeWayParams = Static<typeof ThreeWayParamsSchema>;

/**
 * Require that fastify.pool is non-null.
 */
function requirePool(pool: pg.Pool | null): pg.Pool {
  if (!pool) {
    throw new ApplicationError('Database not available', 'INTERNAL_ERROR', { category: ErrorCategory.DATABASE });
  }
  return pool;
}

/**
 * Calculate book balance for a trust account.
 */
async function calcBookBalance(client: pg.PoolClient, trustAccountId: string): Promise<string> {
  const result = await client.query(
    `SELECT COALESCE(SUM(amount::numeric), 0)::text as balance FROM journal_entries WHERE trust_account_id = $1 AND is_voided = false`,
    [trustAccountId],
  );
  const row = result.rows[0] as { balance: string } | undefined;
  return parseFloat(row?.balance ?? '0').toFixed(2);
}

/**
 * Auto-match unreconciled bank lines to journal entries by amount.
 * Returns the number of matches created.
 */
async function autoMatchBankLines(
  db: ReturnType<typeof drizzle>,
  sessionId: string,
  trustAccountId: string,
): Promise<{ matchCount: number; unmatchedBankLines: number }> {
  const unmatchedLines = await db.select().from(bankStatementLines)
    .where(and(
      eq(bankStatementLines.trustAccountId, trustAccountId),
      eq(bankStatementLines.isReconciled, false),
    ));

  let matchCount = 0;
  for (const bankLine of unmatchedLines) {
    const matchingEntries = await db.select().from(journalEntries)
      .where(and(
        eq(journalEntries.trustAccountId, trustAccountId),
        eq(journalEntries.isVoided, false),
        sql`${journalEntries.amount}::numeric = ${bankLine.amount}::numeric`,
      ));

    if (matchingEntries.length === 0) {
      continue;
    }
    const matchedEntry = matchingEntries[0];
    if (!matchedEntry) continue;

    const existingMatch = await db.select().from(reconciliationMatches)
      .where(and(
        eq(reconciliationMatches.reconciliationId, sessionId),
        eq(reconciliationMatches.journalEntryId, matchedEntry.id),
      ));

    if (existingMatch.length === 0) {
      await db.insert(reconciliationMatches).values({
        reconciliationId: sessionId,
        bankStatementLineId: bankLine.id,
        journalEntryId: matchedEntry.id,
        matchType: 'auto',
      });
      await db.update(bankStatementLines)
        .set({ isReconciled: true })
        .where(eq(bankStatementLines.id, bankLine.id));
      matchCount++;
    }
  }

  return { matchCount, unmatchedBankLines: unmatchedLines.length - matchCount };
}

// eslint-disable-next-line @typescript-eslint/require-await -- Fastify route plugin
async function reconciliationRoutes(fastify: FastifyInstance): Promise<void> {

  /**
   * POST /api/trust/reconciliation — Start a reconciliation session.
   * REF: CON-002 §5.2
   */
  fastify.post<{ Body: StartReconciliationInput }>(
    '/api/trust/reconciliation',
    { schema: { body: StartReconciliationSchema } },
    async (request, reply) => {
      const pool = requirePool(fastify.pool);
      const db = drizzle(pool);
      const body = request.body;

      /* Verify trust account exists */
      const acctResults = await db.select().from(trustAccounts)
        .where(eq(trustAccounts.id, body.trustAccountId));
      if (acctResults.length === 0) {
        throw new ApplicationError('Trust account not found', 'NOT_FOUND', { category: ErrorCategory.RESOURCE });
      }

      /* Calculate book balance */
      const client = await pool.connect();
      let bookBalance: string;
      try {
        bookBalance = await calcBookBalance(client, body.trustAccountId);
      } finally {
        client.release();
      }

      /* Create reconciliation session */
      const sessionResults = await db.insert(reconciliationSessions).values({
        trustAccountId: body.trustAccountId,
        statementEndDate: new Date(body.statementEndDate),
        statementEndBalance: body.statementEndBalance,
        bookBalance,
        preparedByName: body.preparedByName,
      }).returning();

      const session = sessionResults[0];
      if (!session) {
        throw new ApplicationError('Failed to create session', 'INTERNAL_ERROR', { category: ErrorCategory.DATABASE });
      }

      /* Auto-match */
      const { matchCount, unmatchedBankLines } = await autoMatchBankLines(db, session.id, body.trustAccountId);

      /* Calculate variance */
      const variance = (parseFloat(body.statementEndBalance) - parseFloat(bookBalance)).toFixed(2);
      const isBalanced = variance === '0.00';

      await db.update(reconciliationSessions)
        .set({ status: isBalanced ? 'balanced' : 'unbalanced' })
        .where(eq(reconciliationSessions.id, session.id));

      /* Count unmatched book entries */
      const totalJournalResult = await db.select({ total: sql<string>`count(*)::text` })
        .from(journalEntries)
        .where(and(
          eq(journalEntries.trustAccountId, body.trustAccountId),
          eq(journalEntries.isVoided, false),
        ));
      const totalJournal = parseInt(totalJournalResult[0]?.total ?? '0', 10);
      const unmatchedBook = Math.max(0, totalJournal - matchCount);

      request.log.info({
        event: 'trust.reconciliation.started',
        reconciliationId: session.id,
        matchCount,
        variance,
        correlationId: request.correlationId,
      }, 'Reconciliation session started');

      return reply.status(201).send({
        reconciliationId: session.id,
        status: isBalanced ? 'balanced' as const : 'unbalanced' as const,
        bankBalance: body.statementEndBalance,
        bookBalance,
        variance,
        unmatchedBankTransactions: unmatchedBankLines,
        unmatchedBookEntries: unmatchedBook,
      });
    },
  );

  /**
   * GET /api/trust/reconciliation/:id — Get reconciliation details.
   * REF: CON-002 §5.3
   */
  fastify.get<{ Params: ReconciliationIdParams }>(
    '/api/trust/reconciliation/:id',
    { schema: { params: ReconciliationIdParamsSchema } },
    async (request) => {
      const pool = requirePool(fastify.pool);
      const db = drizzle(pool);

      const results = await db.select().from(reconciliationSessions)
        .where(eq(reconciliationSessions.id, request.params.id));
      if (results.length === 0) {
        throw new ApplicationError('Reconciliation session not found', 'NOT_FOUND', {
          category: ErrorCategory.RESOURCE,
        });
      }

      const session = results[0];
      if (!session) {
        throw new ApplicationError('Reconciliation session not found', 'NOT_FOUND', { category: ErrorCategory.RESOURCE });
      }

      const matches = await db.select().from(reconciliationMatches)
        .where(eq(reconciliationMatches.reconciliationId, session.id));

      const variance = (parseFloat(session.statementEndBalance) - parseFloat(session.bookBalance)).toFixed(2);

      return {
        reconciliationId: session.id,
        status: session.status,
        bankBalance: session.statementEndBalance,
        bookBalance: session.bookBalance,
        variance,
        matchedCount: matches.length,
        matches: matches.map(m => ({
          id: m.id,
          bankStatementLineId: m.bankStatementLineId,
          journalEntryId: m.journalEntryId,
          matchType: m.matchType,
        })),
        preparedByName: session.preparedByName,
        createdAt: session.createdAt.toISOString(),
      };
    },
  );

  /**
   * GET /api/trust/accounts/:id/three-way-report — Three-way reconciliation.
   * REF: CON-002 §5.4
   */
  fastify.get<{ Params: ThreeWayParams }>(
    '/api/trust/accounts/:id/three-way-report',
    { schema: { params: ThreeWayParamsSchema } },
    async (request) => {
      const pool = requirePool(fastify.pool);
      const db = drizzle(pool);
      const accountId = request.params.id;

      /* Verify account exists */
      const acctResults = await db.select().from(trustAccounts)
        .where(eq(trustAccounts.id, accountId));
      if (acctResults.length === 0) {
        throw new ApplicationError('Trust account not found', 'NOT_FOUND', { category: ErrorCategory.RESOURCE });
      }

      const client = await pool.connect();
      try {
        const bookBalance = await calcBookBalance(client, accountId);

        /* Bank balance = latest reconciliation's statement end balance */
        const bankResult = await client.query(
          `SELECT statement_end_balance FROM reconciliation_sessions WHERE trust_account_id = $1 ORDER BY created_at DESC LIMIT 1`,
          [accountId],
        );
        const bankRow = bankResult.rows[0] as { statement_end_balance: string } | undefined;
        const bankBalance = parseFloat(bankRow?.statement_end_balance ?? '0').toFixed(2);

        /* Client ledger breakdown */
        const ledgers = await db.select().from(clientLedgers)
          .where(eq(clientLedgers.trustAccountId, accountId));

        const ledgerBreakdown = await Promise.all(ledgers.map(async (ledger) => {
          const balResult = await client.query(
            `SELECT COALESCE(SUM(amount::numeric), 0)::text as balance FROM journal_entries WHERE client_ledger_id = $1 AND is_voided = false`,
            [ledger.id],
          );
          const balRow = balResult.rows[0] as { balance: string } | undefined;
          return {
            ledgerId: ledger.id,
            matterNumber: ledger.matterNumber,
            clientName: ledger.clientName,
            balance: parseFloat(balRow?.balance ?? '0').toFixed(2),
          };
        }));

        const clientLedgerTotal = ledgerBreakdown
          .reduce((sum, l) => sum + parseFloat(l.balance), 0)
          .toFixed(2);

        const bankToBookVariance = (parseFloat(bankBalance) - parseFloat(bookBalance)).toFixed(2);
        const bookToLedgerVariance = (parseFloat(bookBalance) - parseFloat(clientLedgerTotal)).toFixed(2);

        return {
          trustAccountId: accountId,
          bankBalance,
          bookBalance,
          clientLedgerTotal,
          bankToBookVariance,
          bookToLedgerVariance,
          isBalanced: bankToBookVariance === '0.00' && bookToLedgerVariance === '0.00',
          asOfDate: new Date().toISOString(),
          ledgerBreakdown,
        };
      } finally {
        client.release();
      }
    },
  );
}

export default reconciliationRoutes;
