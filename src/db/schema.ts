/**
 * @file src/db/schema.ts
 * @description Drizzle ORM schema definitions for the Trust Accounting Service.
 *
 * READING GUIDE:
 * 1. trust_accounts — bank accounts (IOLTA and operating)
 * 2. client_ledgers — per-matter/client sub-ledgers within a trust account
 * 3. journal_entries — IMMUTABLE transaction records (double-entry bookkeeping)
 * 4. bank_statements / bank_statement_lines — imported bank data
 * 5. reconciliation_sessions / reconciliation_matches — reconciliation workflow
 *
 * CRITICAL: journal_entries are IMMUTABLE. No UPDATE or DELETE.
 * Corrections use void + reversing entry. A DB trigger enforces this.
 *
 * REF: CON-002 §2-5 (API schemas)
 * REF: BLU-ARCH-001 §4.2 (Trust DB design)
 * REF: SPR-004 T-034
 */

import {
  pgTable,
  uuid,
  varchar,
  text,
  numeric,
  boolean,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/* ═══════════════════════════════════════════════════════════════════════════
 * 1. Trust Accounts
 * Bank accounts (IOLTA and operating) managed by the firm.
 * ═══════════════════════════════════════════════════════════════════════ */

export const trustAccounts = pgTable('trust_accounts', {
  id: uuid('id').defaultRandom().primaryKey(),
  bankName: varchar('bank_name', { length: 255 }).notNull(),
  accountNumber: varchar('account_number', { length: 255 }).notNull(),
  routingNumber: varchar('routing_number', { length: 9 }).notNull(),
  accountName: varchar('account_name', { length: 255 }).notNull(),
  accountType: varchar('account_type', { length: 20 }).notNull()
    .$type<'iolta' | 'operating'>(),
  status: varchar('status', { length: 20 }).notNull().default('active')
    .$type<'active' | 'frozen' | 'closed'>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/* ═══════════════════════════════════════════════════════════════════════════
 * 2. Client Ledgers
 * Per-matter/client sub-ledgers within a trust account.
 * Each ledger tracks funds held for a specific client matter.
 * ═══════════════════════════════════════════════════════════════════════ */

export const clientLedgers = pgTable('client_ledgers', {
  id: uuid('id').defaultRandom().primaryKey(),
  trustAccountId: uuid('trust_account_id').notNull()
    .references(() => trustAccounts.id),
  matterId: uuid('matter_id').notNull(),
  clientId: uuid('client_id').notNull(),
  /** Denormalized from web service — snapshot at creation time. */
  matterNumber: varchar('matter_number', { length: 100 }).notNull(),
  /** Denormalized from web service — snapshot at creation time. */
  clientName: varchar('client_name', { length: 255 }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('active')
    .$type<'active' | 'closed'>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('uq_ledger_account_matter_client')
    .on(table.trustAccountId, table.matterId, table.clientId),
  index('idx_ledger_trust_account').on(table.trustAccountId),
]);

/* ═══════════════════════════════════════════════════════════════════════════
 * 3. Journal Entries
 * IMMUTABLE double-entry bookkeeping records.
 *
 * CRITICAL: These rows must NEVER be updated or deleted.
 * A database trigger enforces this constraint.
 * Corrections use void + reversing entry (same entryGroupId).
 * ═══════════════════════════════════════════════════════════════════════ */

export const journalEntries = pgTable('journal_entries', {
  id: uuid('id').defaultRandom().primaryKey(),
  /** Groups related debit/credit entries from a single transaction. */
  entryGroupId: uuid('entry_group_id').notNull(),
  trustAccountId: uuid('trust_account_id').notNull()
    .references(() => trustAccounts.id),
  clientLedgerId: uuid('client_ledger_id')
    .references(() => clientLedgers.id),
  transactionType: varchar('transaction_type', { length: 30 }).notNull()
    .$type<'deposit' | 'disbursement' | 'transfer_in' | 'transfer_out' | 'fee_transfer' | 'void'>(),
  /** Positive = credit, negative = debit. Stored as decimal string. */
  amount: numeric('amount', { precision: 15, scale: 2 }).notNull(),
  /** Running balance AFTER this entry, per client ledger. */
  runningBalance: numeric('running_balance', { precision: 15, scale: 2 }).notNull(),
  description: text('description').notNull(),
  referenceNumber: varchar('reference_number', { length: 255 }),
  payorPayeeName: varchar('payor_payee_name', { length: 255 }),
  paymentMethod: varchar('payment_method', { length: 30 })
    .$type<'check' | 'wire' | 'ach' | 'cash' | 'other'>(),
  /** Denormalized — snapshot at transaction time. */
  matterName: varchar('matter_name', { length: 255 }),
  /** Denormalized — snapshot at transaction time. */
  clientName: varchar('client_name', { length: 255 }),
  createdByName: varchar('created_by_name', { length: 255 }).notNull(),
  isVoided: boolean('is_voided').notNull().default(false),
  voidedByEntryId: uuid('voided_by_entry_id'),
  voidedByName: varchar('voided_by_name', { length: 255 }),
  voidedAt: timestamp('voided_at', { withTimezone: true }),
  voidReason: text('void_reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_journal_account_created')
    .on(table.trustAccountId, table.createdAt),
  index('idx_journal_ledger_created')
    .on(table.clientLedgerId, table.createdAt),
  index('idx_journal_entry_group')
    .on(table.entryGroupId),
]);

/* ═══════════════════════════════════════════════════════════════════════════
 * 4. Bank Statements
 * Imported bank data for reconciliation.
 * ═══════════════════════════════════════════════════════════════════════ */

export const bankStatements = pgTable('bank_statements', {
  id: uuid('id').defaultRandom().primaryKey(),
  trustAccountId: uuid('trust_account_id').notNull()
    .references(() => trustAccounts.id),
  statementDate: timestamp('statement_date', { withTimezone: true }).notNull(),
  importedByName: varchar('imported_by_name', { length: 255 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const bankStatementLines = pgTable('bank_statement_lines', {
  id: uuid('id').defaultRandom().primaryKey(),
  bankStatementId: uuid('bank_statement_id').notNull()
    .references(() => bankStatements.id),
  trustAccountId: uuid('trust_account_id').notNull()
    .references(() => trustAccounts.id),
  date: timestamp('date', { withTimezone: true }).notNull(),
  description: text('description').notNull(),
  /** Positive = deposit, negative = withdrawal. */
  amount: numeric('amount', { precision: 15, scale: 2 }).notNull(),
  /** Bank's transaction ID — used for deduplication. */
  externalId: varchar('external_id', { length: 255 }).notNull(),
  checkNumber: varchar('check_number', { length: 50 }),
  isReconciled: boolean('is_reconciled').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('uq_bank_line_external_id')
    .on(table.trustAccountId, table.externalId),
]);

/* ═══════════════════════════════════════════════════════════════════════════
 * 5. Reconciliation
 * Tracks reconciliation sessions and matches between bank lines and journal entries.
 * ═══════════════════════════════════════════════════════════════════════ */

export const reconciliationSessions = pgTable('reconciliation_sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  trustAccountId: uuid('trust_account_id').notNull()
    .references(() => trustAccounts.id),
  statementEndDate: timestamp('statement_end_date', { withTimezone: true }).notNull(),
  statementEndBalance: numeric('statement_end_balance', { precision: 15, scale: 2 }).notNull(),
  bookBalance: numeric('book_balance', { precision: 15, scale: 2 }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('in_progress')
    .$type<'in_progress' | 'balanced' | 'unbalanced' | 'completed'>(),
  preparedByName: varchar('prepared_by_name', { length: 255 }).notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const reconciliationMatches = pgTable('reconciliation_matches', {
  id: uuid('id').defaultRandom().primaryKey(),
  reconciliationId: uuid('reconciliation_id').notNull()
    .references(() => reconciliationSessions.id),
  bankStatementLineId: uuid('bank_statement_line_id').notNull()
    .references(() => bankStatementLines.id),
  journalEntryId: uuid('journal_entry_id').notNull()
    .references(() => journalEntries.id),
  matchType: varchar('match_type', { length: 20 }).notNull()
    .$type<'auto' | 'manual'>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/* ═══════════════════════════════════════════════════════════════════════════
 * SQL fragments for use in custom migrations
 * ═══════════════════════════════════════════════════════════════════════ */

/**
 * SQL to create the immutability trigger on journal_entries.
 * This MUST be run as part of the migration.
 *
 * PRECONDITION: journal_entries table exists.
 * POSTCONDITION: Any UPDATE or DELETE on journal_entries raises an exception.
 */
export const JOURNAL_IMMUTABILITY_TRIGGER = sql`
  CREATE OR REPLACE FUNCTION prevent_journal_entry_mutation()
  RETURNS TRIGGER AS $$
  BEGIN
    /* DELETE is always prohibited */
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'journal_entries are immutable — DELETE is prohibited.';
      RETURN NULL;
    END IF;

    /* UPDATE: Only void-marking columns may change.
     * Financial columns (amount, running_balance, description, etc.) are frozen. */
    IF TG_OP = 'UPDATE' THEN
      IF NEW.amount IS DISTINCT FROM OLD.amount
        OR NEW.running_balance IS DISTINCT FROM OLD.running_balance
        OR NEW.entry_group_id IS DISTINCT FROM OLD.entry_group_id
        OR NEW.trust_account_id IS DISTINCT FROM OLD.trust_account_id
        OR NEW.client_ledger_id IS DISTINCT FROM OLD.client_ledger_id
        OR NEW.transaction_type IS DISTINCT FROM OLD.transaction_type
        OR NEW.description IS DISTINCT FROM OLD.description
        OR NEW.created_by_name IS DISTINCT FROM OLD.created_by_name
        OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'journal_entries financial data is immutable — only void-marking columns may be updated.';
        RETURN NULL;
      END IF;
      RETURN NEW;
    END IF;

    RETURN NEW;
  END;
  $$ LANGUAGE plpgsql;

  DROP TRIGGER IF EXISTS trg_journal_entries_immutable ON journal_entries;
  CREATE TRIGGER trg_journal_entries_immutable
    BEFORE UPDATE OR DELETE ON journal_entries
    FOR EACH ROW
    EXECUTE FUNCTION prevent_journal_entry_mutation();
`;
