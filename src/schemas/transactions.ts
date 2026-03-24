/**
 * @file src/schemas/transactions.ts
 * @description TypeBox schemas for all transaction routes.
 * These schemas MUST match CON-002 §3 exactly.
 *
 * REF: CON-002 §3 (Transactions)
 * REF: GOV-003 (TypeBox schemas)
 */

import { Type, type Static } from '@sinclair/typebox';

/* ─── Deposit ────────────────────────────────────────────────────────── */

export const DepositRequestSchema = Type.Object({
  trustAccountId: Type.String({ format: 'uuid' }),
  clientLedgerId: Type.String({ format: 'uuid' }),
  amount: Type.String({ pattern: '^\\d+\\.\\d{2}$' }),
  description: Type.String({ minLength: 1, maxLength: 500 }),
  payorName: Type.String({ minLength: 1 }),
  paymentMethod: Type.Union([
    Type.Literal('check'), Type.Literal('wire'),
    Type.Literal('ach'), Type.Literal('cash'), Type.Literal('other'),
  ]),
  referenceNumber: Type.Optional(Type.String()),
  createdByName: Type.String({ minLength: 1 }),
});

export type DepositRequest = Static<typeof DepositRequestSchema>;

/* ─── Disbursement ───────────────────────────────────────────────────── */

export const DisburseRequestSchema = Type.Object({
  trustAccountId: Type.String({ format: 'uuid' }),
  clientLedgerId: Type.String({ format: 'uuid' }),
  amount: Type.String({ pattern: '^\\d+\\.\\d{2}$' }),
  description: Type.String({ minLength: 1, maxLength: 500 }),
  payeeName: Type.String({ minLength: 1 }),
  paymentMethod: Type.Union([
    Type.Literal('check'), Type.Literal('wire'),
    Type.Literal('ach'), Type.Literal('other'),
  ]),
  referenceNumber: Type.Optional(Type.String()),
  createdByName: Type.String({ minLength: 1 }),
});

export type DisburseRequest = Static<typeof DisburseRequestSchema>;

/* ─── Transfer ───────────────────────────────────────────────────────── */

export const TransferRequestSchema = Type.Object({
  trustAccountId: Type.String({ format: 'uuid' }),
  fromLedgerId: Type.String({ format: 'uuid' }),
  toLedgerId: Type.String({ format: 'uuid' }),
  amount: Type.String({ pattern: '^\\d+\\.\\d{2}$' }),
  description: Type.String({ minLength: 1, maxLength: 500 }),
  createdByName: Type.String({ minLength: 1 }),
});

export type TransferRequest = Static<typeof TransferRequestSchema>;

/* ─── Fee Transfer ───────────────────────────────────────────────────── */

export const FeeTransferRequestSchema = Type.Object({
  trustAccountId: Type.String({ format: 'uuid' }),
  clientLedgerId: Type.String({ format: 'uuid' }),
  operatingAccountId: Type.String({ format: 'uuid' }),
  amount: Type.String({ pattern: '^\\d+\\.\\d{2}$' }),
  description: Type.String({ minLength: 1, maxLength: 500 }),
  invoiceReference: Type.Optional(Type.String()),
  createdByName: Type.String({ minLength: 1 }),
});

export type FeeTransferRequest = Static<typeof FeeTransferRequestSchema>;

/* ─── Void ───────────────────────────────────────────────────────────── */

export const VoidRequestSchema = Type.Object({
  reason: Type.String({ minLength: 1, maxLength: 500 }),
  voidedByName: Type.String({ minLength: 1 }),
});

export type VoidRequest = Static<typeof VoidRequestSchema>;

export const VoidParamsSchema = Type.Object({
  entryId: Type.String({ format: 'uuid' }),
});

export type VoidParams = Static<typeof VoidParamsSchema>;

/* ─── Transaction Query ──────────────────────────────────────────────── */

export const LedgerTransactionsParamsSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
});

export const LedgerTransactionsQuerySchema = Type.Object({
  page: Type.Optional(Type.Number({ minimum: 1, default: 1 })),
  pageSize: Type.Optional(Type.Number({ minimum: 1, maximum: 100, default: 50 })),
  startDate: Type.Optional(Type.String()),
  endDate: Type.Optional(Type.String()),
});

export const TransactionDetailParamsSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
});

/* ─── Transaction Response (shared) ──────────────────────────────────── */

export const TransactionResponseSchema = Type.Object({
  entryId: Type.String(),
  trustAccountBalance: Type.String(),
  clientLedgerBalance: Type.String(),
  createdAt: Type.String(),
});

export const TransferResponseSchema = Type.Object({
  entryId: Type.String(),
  fromLedgerBalance: Type.String(),
  toLedgerBalance: Type.String(),
  createdAt: Type.String(),
});

export const FeeTransferResponseSchema = Type.Object({
  entryId: Type.String(),
  clientLedgerBalance: Type.String(),
  trustAccountBalance: Type.String(),
  createdAt: Type.String(),
});

export const VoidResponseSchema = Type.Object({
  voidEntryId: Type.String(),
  originalEntryId: Type.String(),
  trustAccountBalance: Type.String(),
  clientLedgerBalance: Type.String(),
  voidedAt: Type.String(),
});

/* ─── Bank Statement Import ──────────────────────────────────────────── */

export const BankStatementImportSchema = Type.Object({
  trustAccountId: Type.String({ format: 'uuid' }),
  statementDate: Type.String(),
  transactions: Type.Array(Type.Object({
    date: Type.String(),
    description: Type.String(),
    amount: Type.String(),
    externalId: Type.String(),
    checkNumber: Type.Optional(Type.String()),
  })),
  importedByName: Type.String({ minLength: 1 }),
});

export type BankStatementImportInput = Static<typeof BankStatementImportSchema>;

export const BankStatementImportResponseSchema = Type.Object({
  imported: Type.Number(),
  duplicatesSkipped: Type.Number(),
  statementId: Type.String(),
});

/* ─── Reconciliation ─────────────────────────────────────────────────── */

export const StartReconciliationSchema = Type.Object({
  trustAccountId: Type.String({ format: 'uuid' }),
  statementEndDate: Type.String(),
  statementEndBalance: Type.String(),
  preparedByName: Type.String({ minLength: 1 }),
});

export type StartReconciliationInput = Static<typeof StartReconciliationSchema>;

export const ReconciliationResponseSchema = Type.Object({
  reconciliationId: Type.String(),
  status: Type.Union([Type.Literal('balanced'), Type.Literal('unbalanced')]),
  bankBalance: Type.String(),
  bookBalance: Type.String(),
  variance: Type.String(),
  unmatchedBankTransactions: Type.Number(),
  unmatchedBookEntries: Type.Number(),
});

export const ThreeWayReportSchema = Type.Object({
  trustAccountId: Type.String(),
  bankBalance: Type.String(),
  bookBalance: Type.String(),
  clientLedgerTotal: Type.String(),
  bankToBookVariance: Type.String(),
  bookToLedgerVariance: Type.String(),
  isBalanced: Type.Boolean(),
  asOfDate: Type.String(),
  ledgerBreakdown: Type.Array(Type.Object({
    ledgerId: Type.String(),
    matterNumber: Type.String(),
    clientName: Type.String(),
    balance: Type.String(),
  })),
});
