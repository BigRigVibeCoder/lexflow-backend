/**
 * @file src/routes/bank-statements.ts
 * @description Bank statement import route.
 *
 * REF: CON-002 §5.1
 * REF: SPR-004 T-047
 */

import type { FastifyInstance } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { bankStatements, bankStatementLines, trustAccounts } from '../db/schema.js';
import { ApplicationError, ErrorCategory } from '../lib/errors.js';
import type { BankStatementImportInput } from '../schemas/transactions.js';
import { BankStatementImportSchema } from '../schemas/transactions.js';

// eslint-disable-next-line @typescript-eslint/require-await -- Fastify route plugin
async function bankStatementRoutes(fastify: FastifyInstance): Promise<void> {

  /**
   * POST /api/trust/bank-statements/import
   * Import bank statement transactions with deduplication by externalId.
   * REF: CON-002 §5.1
   */
  fastify.post<{ Body: BankStatementImportInput }>(
    '/api/trust/bank-statements/import',
    { schema: { body: BankStatementImportSchema } },
    async (request, reply) => {
      if (!fastify.pool) {
        throw new ApplicationError('Database not available', 'INTERNAL_ERROR', { category: ErrorCategory.DATABASE });
      }
      const db = drizzle(fastify.pool);
      const body = request.body;

      /* Verify trust account exists */
      const acctResults = await db.select().from(trustAccounts)
        .where(eq(trustAccounts.id, body.trustAccountId));
      if (acctResults.length === 0) {
        throw new ApplicationError('Trust account not found', 'NOT_FOUND', {
          category: ErrorCategory.RESOURCE, operation: 'bank-import',
        });
      }

      /* Create bank statement record */
      const [statement] = await db.insert(bankStatements).values({
        trustAccountId: body.trustAccountId,
        statementDate: new Date(body.statementDate),
        importedByName: body.importedByName,
      }).returning();

      if (!statement) {
        throw new ApplicationError('Failed to create statement', 'INTERNAL_ERROR', { category: ErrorCategory.DATABASE });
      }

      let imported = 0;
      let duplicatesSkipped = 0;

      for (const tx of body.transactions) {
        /* Check for duplicate by externalId + trustAccountId */
        const existing = await db.select().from(bankStatementLines)
          .where(and(
            eq(bankStatementLines.trustAccountId, body.trustAccountId),
            eq(bankStatementLines.externalId, tx.externalId),
          ));

        if (existing.length > 0) {
          duplicatesSkipped++;
          continue;
        }

        await db.insert(bankStatementLines).values({
          bankStatementId: statement.id,
          trustAccountId: body.trustAccountId,
          date: new Date(tx.date),
          description: tx.description,
          amount: tx.amount,
          externalId: tx.externalId,
          checkNumber: tx.checkNumber,
        });

        imported++;
      }

      request.log.info({
        event: 'trust.bank-import',
        statementId: statement.id,
        trustAccountId: body.trustAccountId,
        imported,
        duplicatesSkipped,
        correlationId: request.correlationId,
      }, 'Bank statement imported');

      return reply.status(201).send({
        imported,
        duplicatesSkipped,
        statementId: statement.id,
      });
    },
  );
}

export default bankStatementRoutes;
