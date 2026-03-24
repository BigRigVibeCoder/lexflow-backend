/**
 * @file src/routes/trust-accounts.ts
 * @description Trust account and client ledger routes.
 *
 * REF: CON-002 §2.1-2.5
 * REF: SPR-004 T-039
 */

import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { eq, count } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { trustAccounts, clientLedgers } from '../db/schema.js';
import { ApplicationError, ErrorCategory } from '../lib/errors.js';
import { createWebClient, type ValidateMatterClientResult } from '../services/web-client.js';
import type {
  CreateTrustAccountInput,
  CreateClientLedgerInput,
  AccountIdParams,
} from '../schemas/trust-accounts.js';
import {
  CreateTrustAccountSchema,
  CreateClientLedgerSchema,
  AccountIdParamsSchema,
} from '../schemas/trust-accounts.js';

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
 * Get balance for a trust account from raw SQL.
 */
async function getAccountBalance(client: pg.PoolClient, accountId: string): Promise<string> {
  const result = await client.query(
    `SELECT COALESCE(SUM(amount::numeric), 0)::text as balance FROM journal_entries WHERE trust_account_id = $1 AND is_voided = false`,
    [accountId],
  );
  const row = result.rows[0] as { balance: string } | undefined;
  return parseFloat(row?.balance ?? '0').toFixed(2);
}

/**
 * Get balance for a client ledger from raw SQL.
 */
async function getLedgerBalance(client: pg.PoolClient, ledgerId: string): Promise<string> {
  const result = await client.query(
    `SELECT COALESCE(SUM(amount::numeric), 0)::text as balance FROM journal_entries WHERE client_ledger_id = $1 AND is_voided = false`,
    [ledgerId],
  );
  const row = result.rows[0] as { balance: string } | undefined;
  return parseFloat(row?.balance ?? '0').toFixed(2);
}

/**
 * Validate matter/client via web service and throw typed errors on failure.
 */
async function validateMatterClientOrThrow(
  matterId: string,
  clientId: string,
): Promise<{ matterNumber: string; clientName: string }> {
  const webClient = createWebClient();

  try {
    const validation: ValidateMatterClientResult = await webClient.validateMatterClient(matterId, clientId);

    if (!validation.valid) {
      const reason = validation.reason ?? 'Validation failed';
      const code = reason.toLowerCase().includes('matter') ? 'MATTER_NOT_FOUND' as const : 'CLIENT_NOT_FOUND' as const;
      throw new ApplicationError(reason, code, { category: ErrorCategory.VALIDATION });
    }

    return {
      matterNumber: validation.matterNumber ?? 'UNKNOWN',
      clientName: validation.clientName ?? 'UNKNOWN',
    };
  } catch (error: unknown) {
    if (error instanceof ApplicationError) {
      throw error;
    }
    if (process.env['NODE_ENV'] === 'development') {
      return { matterNumber: 'DEV-MATTER', clientName: 'Dev Client' };
    }
    throw new ApplicationError('Web service unreachable', 'INTERNAL_ERROR', {
      category: ErrorCategory.EXTERNAL_SERVICE,
    });
  }
}

// eslint-disable-next-line @typescript-eslint/require-await -- Fastify route plugin
async function trustAccountRoutes(fastify: FastifyInstance): Promise<void> {

  /**
   * POST /api/trust/accounts — Create a trust account.
   * REF: CON-002 §2.1
   */
  fastify.post<{ Body: CreateTrustAccountInput }>(
    '/api/trust/accounts',
    { schema: { body: CreateTrustAccountSchema } },
    async (request, reply) => {
      const pool = requirePool(fastify.pool);
      const db = drizzle(pool);
      const body = request.body;

      const results = await db.insert(trustAccounts).values({
        bankName: body.bankName,
        accountNumber: body.accountNumber,
        routingNumber: body.routingNumber,
        accountName: body.accountName,
        accountType: body.accountType,
      }).returning();

      const account = results[0];
      if (!account) {
        throw new ApplicationError('Failed to create account', 'INTERNAL_ERROR', { category: ErrorCategory.DATABASE });
      }

      request.log.info(
        { event: 'trust.account.created', accountId: account.id, accountType: body.accountType, correlationId: request.correlationId },
        'Trust account created',
      );

      return reply.status(201).send({
        id: account.id,
        bankName: account.bankName,
        accountName: account.accountName,
        accountType: account.accountType,
        balance: '0.00',
        createdAt: account.createdAt.toISOString(),
      });
    },
  );

  /**
   * GET /api/trust/accounts — List all trust accounts.
   * REF: CON-002 §2.2
   */
  fastify.get('/api/trust/accounts', async () => {
    const pool = requirePool(fastify.pool);
    const db = drizzle(pool);

    const accounts = await db.select().from(trustAccounts);
    const client = await pool.connect();

    try {
      const data = await Promise.all(accounts.map(async (acct) => {
        const balance = await getAccountBalance(client, acct.id);
        const ledgerCountResult = await db.select({ value: count() })
          .from(clientLedgers)
          .where(eq(clientLedgers.trustAccountId, acct.id));

        return {
          id: acct.id,
          bankName: acct.bankName,
          accountName: acct.accountName,
          accountType: acct.accountType,
          balance,
          ledgerCount: ledgerCountResult[0]?.value ?? 0,
          createdAt: acct.createdAt.toISOString(),
        };
      }));

      return { data };
    } finally {
      client.release();
    }
  });

  /**
   * GET /api/trust/accounts/:id — Get a single trust account.
   * REF: CON-002 §2.3
   */
  fastify.get<{ Params: AccountIdParams }>(
    '/api/trust/accounts/:id',
    { schema: { params: AccountIdParamsSchema } },
    async (request) => {
      const pool = requirePool(fastify.pool);
      const db = drizzle(pool);
      const { id } = request.params;

      const results = await db.select().from(trustAccounts).where(eq(trustAccounts.id, id));
      if (results.length === 0) {
        throw new ApplicationError('Trust account not found', 'NOT_FOUND', {
          category: ErrorCategory.RESOURCE, operation: 'get-account',
        });
      }

      const acct = results[0];
      if (!acct) {
        throw new ApplicationError('Trust account not found', 'NOT_FOUND', { category: ErrorCategory.RESOURCE });
      }

      const client = await pool.connect();
      try {
        const balance = await getAccountBalance(client, id);
        const ledgerCountResult = await db.select({ value: count() })
          .from(clientLedgers)
          .where(eq(clientLedgers.trustAccountId, id));

        return {
          id: acct.id,
          bankName: acct.bankName,
          accountName: acct.accountName,
          accountType: acct.accountType,
          balance,
          ledgerCount: ledgerCountResult[0]?.value ?? 0,
          createdAt: acct.createdAt.toISOString(),
        };
      } finally {
        client.release();
      }
    },
  );

  /**
   * POST /api/trust/accounts/:id/ledgers — Create a client ledger.
   * Validates matter/client via web service (CON-001 §4).
   * REF: CON-002 §2.4
   */
  fastify.post<{ Params: AccountIdParams; Body: CreateClientLedgerInput }>(
    '/api/trust/accounts/:id/ledgers',
    { schema: { params: AccountIdParamsSchema, body: CreateClientLedgerSchema } },
    async (request, reply) => {
      const pool = requirePool(fastify.pool);
      const db = drizzle(pool);
      const { id: trustAccountId } = request.params;
      const body = request.body;

      /* Verify trust account exists */
      const acctResults = await db.select().from(trustAccounts).where(eq(trustAccounts.id, trustAccountId));
      if (acctResults.length === 0) {
        throw new ApplicationError('Trust account not found', 'NOT_FOUND', {
          category: ErrorCategory.RESOURCE, operation: 'create-ledger',
        });
      }

      /* Validate matter/client via web service */
      const { matterNumber, clientName } = await validateMatterClientOrThrow(body.matterId, body.clientId);

      /* Check for duplicate ledger */
      const existing = await db.select().from(clientLedgers)
        .where(eq(clientLedgers.trustAccountId, trustAccountId));
      const isDuplicate = existing.some(l =>
        l.matterId === body.matterId && l.clientId === body.clientId,
      );
      if (isDuplicate) {
        throw new ApplicationError(
          'Ledger already exists for this matter+client on this account',
          'DUPLICATE_ENTRY',
          { category: ErrorCategory.BUSINESS_LOGIC, operation: 'create-ledger' },
        );
      }

      const insertResults = await db.insert(clientLedgers).values({
        trustAccountId,
        matterId: body.matterId,
        clientId: body.clientId,
        matterNumber,
        clientName,
      }).returning();

      const ledger = insertResults[0];
      if (!ledger) {
        throw new ApplicationError('Failed to create ledger', 'INTERNAL_ERROR', { category: ErrorCategory.DATABASE });
      }

      request.log.info(
        { event: 'trust.ledger.created', ledgerId: ledger.id, trustAccountId, correlationId: request.correlationId },
        'Client ledger created',
      );

      return reply.status(201).send({
        id: ledger.id,
        trustAccountId: ledger.trustAccountId,
        matterId: ledger.matterId,
        clientId: ledger.clientId,
        matterNumber: ledger.matterNumber,
        clientName: ledger.clientName,
        balance: '0.00',
        createdAt: ledger.createdAt.toISOString(),
      });
    },
  );

  /**
   * GET /api/trust/accounts/:id/ledgers — List client ledgers.
   * REF: CON-002 §2.5
   */
  fastify.get<{ Params: AccountIdParams }>(
    '/api/trust/accounts/:id/ledgers',
    { schema: { params: AccountIdParamsSchema } },
    async (request) => {
      const pool = requirePool(fastify.pool);
      const db = drizzle(pool);
      const { id: trustAccountId } = request.params;

      const ledgers = await db.select().from(clientLedgers)
        .where(eq(clientLedgers.trustAccountId, trustAccountId));

      const client = await pool.connect();
      try {
        const data = await Promise.all(ledgers.map(async (ledger) => {
          const balance = await getLedgerBalance(client, ledger.id);

          return {
            id: ledger.id,
            trustAccountId: ledger.trustAccountId,
            matterId: ledger.matterId,
            clientId: ledger.clientId,
            matterNumber: ledger.matterNumber,
            clientName: ledger.clientName,
            balance,
            createdAt: ledger.createdAt.toISOString(),
          };
        }));

        return { data };
      } finally {
        client.release();
      }
    },
  );
}

export default trustAccountRoutes;
