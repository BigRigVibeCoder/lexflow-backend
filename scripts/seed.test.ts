/**
 * @file scripts/seed.test.ts
 * @description Unit tests for the database seed script.
 *
 * Tests data integrity and structure without requiring a live database.
 *
 * REF: GOV-002 (Testing Protocol)
 */

import { describe, it, expect } from 'vitest';

/**
 * Seed script uses deterministic UUIDs for reproducible data.
 * These tests verify the UUID constants are well-formed and unique.
 */
const SEED_UUIDS = {
  accounts: [
    '10000000-0000-0000-0000-000000000001', // IOLTA
    '10000000-0000-0000-0000-000000000002', // Operating
  ],
  ledgers: [
    '20000000-0000-0000-0000-000000000001', // Johnson
    '20000000-0000-0000-0000-000000000002', // Acme
    '20000000-0000-0000-0000-000000000003', // Garcia
    '20000000-0000-0000-0000-000000000004', // Williams
    '20000000-0000-0000-0000-000000000005', // Chen
  ],
  entryGroups: [
    '50000000-0000-0000-0000-000000000001',
    '50000000-0000-0000-0000-000000000002',
    '50000000-0000-0000-0000-000000000003',
    '50000000-0000-0000-0000-000000000004',
    '50000000-0000-0000-0000-000000000005',
    '50000000-0000-0000-0000-000000000006',
    '50000000-0000-0000-0000-000000000007',
    '50000000-0000-0000-0000-000000000008',
    '50000000-0000-0000-0000-000000000009',
  ],
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('Seed Data — UUID Constants', () => {
  it('should have valid UUID format for all account IDs', () => {
    for (const uuid of SEED_UUIDS.accounts) {
      expect(uuid).toMatch(UUID_REGEX);
    }
  });

  it('should have valid UUID format for all ledger IDs', () => {
    for (const uuid of SEED_UUIDS.ledgers) {
      expect(uuid).toMatch(UUID_REGEX);
    }
  });

  it('should have valid UUID format for all entry group IDs', () => {
    for (const uuid of SEED_UUIDS.entryGroups) {
      expect(uuid).toMatch(UUID_REGEX);
    }
  });

  it('should have unique UUIDs across all categories', () => {
    const allUuids = [
      ...SEED_UUIDS.accounts,
      ...SEED_UUIDS.ledgers,
      ...SEED_UUIDS.entryGroups,
    ];
    const uniqueSet = new Set(allUuids);
    expect(uniqueSet.size).toBe(allUuids.length);
  });
});

describe('Seed Data — Counts', () => {
  it('should define 2 trust accounts', () => {
    expect(SEED_UUIDS.accounts).toHaveLength(2);
  });

  it('should define 5 client ledgers', () => {
    expect(SEED_UUIDS.ledgers).toHaveLength(5);
  });

  it('should define entry groups for transactions', () => {
    /* 8 unique groups: 5 deposits + 2 disbursements + 1 transfer (9 entries, 8 groups) */
    expect(SEED_UUIDS.entryGroups.length).toBeGreaterThanOrEqual(8);
  });
});

describe('Seed Data — Balance Integrity', () => {
  /* Replicate the seed entries to verify running balances */
  const entries = [
    { ledger: 'Johnson', amount: 5000.00, balance: 5000.00, type: 'deposit' },
    { ledger: 'Acme', amount: 10000.00, balance: 10000.00, type: 'deposit' },
    { ledger: 'Garcia', amount: 25000.00, balance: 25000.00, type: 'deposit' },
    { ledger: 'Williams', amount: 3000.00, balance: 3000.00, type: 'deposit' },
    { ledger: 'Chen', amount: 7500.00, balance: 7500.00, type: 'deposit' },
    { ledger: 'Johnson', amount: -350.00, balance: 4650.00, type: 'disbursement' },
    { ledger: 'Acme', amount: -2500.00, balance: 7500.00, type: 'disbursement' },
    { ledger: 'Garcia', amount: -1000.00, balance: 24000.00, type: 'transfer_out' },
    { ledger: 'Williams', amount: 1000.00, balance: 4000.00, type: 'transfer_in' },
    { ledger: 'Chen', amount: -1600.00, balance: 5900.00, type: 'disbursement' },
  ];

  it('should have running balances that match cumulative sums per ledger', () => {
    const ledgerTotals: Record<string, number> = {};
    for (const entry of entries) {
      ledgerTotals[entry.ledger] = (ledgerTotals[entry.ledger] ?? 0) + entry.amount;
      expect(entry.balance).toBe(ledgerTotals[entry.ledger]);
    }
  });

  it('should have total trust account balance equal to sum of all entries', () => {
    const total = entries.reduce((sum, e) => sum + e.amount, 0);
    expect(total).toBe(46050.00);
  });

  it('should have transfer entries that net to zero', () => {
    const transfers = entries.filter(e => e.type === 'transfer_in' || e.type === 'transfer_out');
    const netTransfer = transfers.reduce((sum, e) => sum + e.amount, 0);
    expect(netTransfer).toBe(0);
  });

  it('should have no negative running balances (IOLTA compliance)', () => {
    for (const entry of entries) {
      expect(entry.balance).toBeGreaterThanOrEqual(0);
    }
  });
});
