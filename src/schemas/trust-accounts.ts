/**
 * @file src/schemas/trust-accounts.ts
 * @description TypeBox schemas for trust account and client ledger routes.
 * These schemas MUST match CON-002 §2.1-2.5 exactly.
 *
 * REF: CON-002 §2 (Trust Accounts)
 * REF: GOV-003 (TypeBox schemas)
 */

import { Type, type Static } from '@sinclair/typebox';

/* ─── Trust Account Schemas ──────────────────────────────────────────── */

export const CreateTrustAccountSchema = Type.Object({
  bankName: Type.String({ minLength: 1, maxLength: 255 }),
  accountNumber: Type.String({ minLength: 1, maxLength: 255 }),
  routingNumber: Type.String({ minLength: 9, maxLength: 9 }),
  accountName: Type.String({ minLength: 1, maxLength: 255 }),
  accountType: Type.Union([Type.Literal('iolta'), Type.Literal('operating')]),
});

export type CreateTrustAccountInput = Static<typeof CreateTrustAccountSchema>;

export const TrustAccountResponseSchema = Type.Object({
  id: Type.String(),
  bankName: Type.String(),
  accountName: Type.String(),
  accountType: Type.Union([Type.Literal('iolta'), Type.Literal('operating')]),
  balance: Type.String(),
  createdAt: Type.String(),
});

export const TrustAccountListItemSchema = Type.Object({
  id: Type.String(),
  bankName: Type.String(),
  accountName: Type.String(),
  accountType: Type.Union([Type.Literal('iolta'), Type.Literal('operating')]),
  balance: Type.String(),
  ledgerCount: Type.Number(),
  createdAt: Type.String(),
});

export const TrustAccountListResponseSchema = Type.Object({
  data: Type.Array(TrustAccountListItemSchema),
});

/* ─── Client Ledger Schemas ──────────────────────────────────────────── */

export const CreateClientLedgerSchema = Type.Object({
  matterId: Type.String({ format: 'uuid' }),
  clientId: Type.String({ format: 'uuid' }),
  createdByName: Type.String({ minLength: 1, maxLength: 255 }),
});

export type CreateClientLedgerInput = Static<typeof CreateClientLedgerSchema>;

export const ClientLedgerResponseSchema = Type.Object({
  id: Type.String(),
  trustAccountId: Type.String(),
  matterId: Type.String(),
  clientId: Type.String(),
  matterNumber: Type.String(),
  clientName: Type.String(),
  balance: Type.String(),
  createdAt: Type.String(),
});

export const ClientLedgerListResponseSchema = Type.Object({
  data: Type.Array(ClientLedgerResponseSchema),
});

/* ─── Route Param Schemas ────────────────────────────────────────────── */

export const AccountIdParamsSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
});

export type AccountIdParams = Static<typeof AccountIdParamsSchema>;
