/**
 * @file scripts/seed.ts
 * @description Database seed script for the Trust Accounting Service.
 *
 * Populates lexflow_trust with realistic sample data:
 * - 2 trust accounts (IOLTA + operating)
 * - 5 client ledgers (different matters/clients)
 * - 10 journal entries (deposits, disbursements, transfers)
 *
 * Usage:
 *   npx tsx scripts/seed.ts
 *   npx tsx scripts/seed.ts --clean  (drops + re-seeds)
 *
 * PRECONDITION: Database lexflow_trust must exist with schema applied.
 *   psql -d lexflow_trust -f migrations/001_trust_schema.sql
 *
 * REF: SPR-004 (Trust Accounting Backend)
 */

import pg from 'pg';

/* ─── Configuration ──────────────────────────────────────────────── */

const DATABASE_URL = process.env['DATABASE_URL'] ?? 'postgresql://localhost:5432/lexflow_trust';

/* ─── Deterministic UUIDs for reproducible seed data ─────────────── */

/** IOLTA trust account. */
const IOLTA_ACCOUNT_ID = '10000000-0000-0000-0000-000000000001';
/** Operating/fee account. */
const OPERATING_ACCOUNT_ID = '10000000-0000-0000-0000-000000000002';

/** Client ledger: Johnson v. Smith (personal injury). */
const LEDGER_JOHNSON_ID = '20000000-0000-0000-0000-000000000001';
/** Client ledger: Acme Corp (business formation). */
const LEDGER_ACME_ID = '20000000-0000-0000-0000-000000000002';
/** Client ledger: Garcia Estate (probate). */
const LEDGER_GARCIA_ID = '20000000-0000-0000-0000-000000000003';
/** Client ledger: Williams Divorce (family law). */
const LEDGER_WILLIAMS_ID = '20000000-0000-0000-0000-000000000004';
/** Client ledger: Chen IP (patent application). */
const LEDGER_CHEN_ID = '20000000-0000-0000-0000-000000000005';

/** Matter and client IDs (simulated — normally from web service). */
const MATTER_JOHNSON = '30000000-0000-0000-0000-000000000001';
const MATTER_ACME = '30000000-0000-0000-0000-000000000002';
const MATTER_GARCIA = '30000000-0000-0000-0000-000000000003';
const MATTER_WILLIAMS = '30000000-0000-0000-0000-000000000004';
const MATTER_CHEN = '30000000-0000-0000-0000-000000000005';

const CLIENT_JOHNSON = '40000000-0000-0000-0000-000000000001';
const CLIENT_ACME = '40000000-0000-0000-0000-000000000002';
const CLIENT_GARCIA = '40000000-0000-0000-0000-000000000003';
const CLIENT_WILLIAMS = '40000000-0000-0000-0000-000000000004';
const CLIENT_CHEN = '40000000-0000-0000-0000-000000000005';

/** Entry group IDs for journal entries. */
const ENTRY_GROUP_1 = '50000000-0000-0000-0000-000000000001';
const ENTRY_GROUP_2 = '50000000-0000-0000-0000-000000000002';
const ENTRY_GROUP_3 = '50000000-0000-0000-0000-000000000003';
const ENTRY_GROUP_4 = '50000000-0000-0000-0000-000000000004';
const ENTRY_GROUP_5 = '50000000-0000-0000-0000-000000000005';
const ENTRY_GROUP_6 = '50000000-0000-0000-0000-000000000006';
const ENTRY_GROUP_7 = '50000000-0000-0000-0000-000000000007';
const ENTRY_GROUP_8 = '50000000-0000-0000-0000-000000000008';

/* ─── Seed Functions ─────────────────────────────────────────────── */

/**
 * Insert trust accounts.
 */
async function seedTrustAccounts(client: pg.PoolClient): Promise<void> {
  console.log('  → Seeding trust accounts...');
  await client.query(`
    INSERT INTO trust_accounts (id, bank_name, account_number, routing_number, account_name, account_type, status)
    VALUES
      ($1, 'First National Bank', '****4521', '021000021', 'Main IOLTA Account', 'iolta', 'active'),
      ($2, 'First National Bank', '****4522', '021000021', 'Operating Account', 'operating', 'active')
    ON CONFLICT (id) DO NOTHING
  `, [IOLTA_ACCOUNT_ID, OPERATING_ACCOUNT_ID]);
}

/**
 * Insert client ledgers (5 matters across different practice areas).
 */
async function seedClientLedgers(client: pg.PoolClient): Promise<void> {
  console.log('  → Seeding client ledgers...');
  await client.query(`
    INSERT INTO client_ledgers
      (id, trust_account_id, matter_id, client_id, matter_number, client_name, status)
    VALUES
      ($1,  $6,  $11, $16, 'PI-2026-001', 'Robert Johnson', 'active'),
      ($2,  $6,  $12, $17, 'BF-2026-002', 'Acme Corporation', 'active'),
      ($3,  $6,  $13, $18, 'PR-2026-003', 'Garcia Estate', 'active'),
      ($4,  $6,  $14, $19, 'FL-2026-004', 'Sarah Williams', 'active'),
      ($5,  $6,  $15, $20, 'IP-2026-005', 'David Chen', 'active')
    ON CONFLICT DO NOTHING
  `, [
    LEDGER_JOHNSON_ID, LEDGER_ACME_ID, LEDGER_GARCIA_ID, LEDGER_WILLIAMS_ID, LEDGER_CHEN_ID,
    IOLTA_ACCOUNT_ID,
    MATTER_JOHNSON, MATTER_ACME, MATTER_GARCIA, MATTER_WILLIAMS, MATTER_CHEN,
    CLIENT_JOHNSON, CLIENT_ACME, CLIENT_GARCIA, CLIENT_WILLIAMS, CLIENT_CHEN,
  ]);
}

/**
 * Insert journal entries — 10 transactions showing realistic trust activity.
 *
 * Scenario:
 * 1. Johnson retainer deposit: $5,000
 * 2. Acme retainer deposit: $10,000
 * 3. Garcia estate deposit: $25,000
 * 4. Williams retainer deposit: $3,000
 * 5. Chen retainer deposit: $7,500
 * 6. Johnson court filing fee disbursement: -$350
 * 7. Acme consulting payment disbursement: -$2,500
 * 8. Garcia → Williams transfer: $1,000 (family law referral)
 * 9. Johnson fee transfer to operating: -$1,500
 * 10. Chen patent filing disbursement: -$1,600
 */
async function seedJournalEntries(client: pg.PoolClient): Promise<void> {
  console.log('  → Seeding journal entries (10 transactions)...');

  const entries = [
    /* 1. Johnson retainer deposit */
    {
      entryGroupId: ENTRY_GROUP_1,
      trustAccountId: IOLTA_ACCOUNT_ID,
      clientLedgerId: LEDGER_JOHNSON_ID,
      transactionType: 'deposit',
      amount: '5000.00',
      runningBalance: '5000.00',
      description: 'Initial retainer deposit — Johnson v. Smith',
      payorPayeeName: 'Robert Johnson',
      paymentMethod: 'check',
      referenceNumber: 'CHK-10042',
      matterName: 'PI-2026-001',
      clientName: 'Robert Johnson',
      createdByName: 'Sarah Mitchell, Esq.',
    },
    /* 2. Acme retainer deposit */
    {
      entryGroupId: ENTRY_GROUP_2,
      trustAccountId: IOLTA_ACCOUNT_ID,
      clientLedgerId: LEDGER_ACME_ID,
      transactionType: 'deposit',
      amount: '10000.00',
      runningBalance: '10000.00',
      description: 'Business formation retainer — Acme Corp',
      payorPayeeName: 'Acme Corporation',
      paymentMethod: 'wire',
      referenceNumber: 'WIR-20250115',
      matterName: 'BF-2026-002',
      clientName: 'Acme Corporation',
      createdByName: 'James Park, Esq.',
    },
    /* 3. Garcia estate deposit */
    {
      entryGroupId: ENTRY_GROUP_3,
      trustAccountId: IOLTA_ACCOUNT_ID,
      clientLedgerId: LEDGER_GARCIA_ID,
      transactionType: 'deposit',
      amount: '25000.00',
      runningBalance: '25000.00',
      description: 'Estate settlement proceeds — Garcia Estate',
      payorPayeeName: 'Superior Court of County',
      paymentMethod: 'check',
      referenceNumber: 'CHK-77291',
      matterName: 'PR-2026-003',
      clientName: 'Garcia Estate',
      createdByName: 'Sarah Mitchell, Esq.',
    },
    /* 4. Williams retainer deposit */
    {
      entryGroupId: ENTRY_GROUP_4,
      trustAccountId: IOLTA_ACCOUNT_ID,
      clientLedgerId: LEDGER_WILLIAMS_ID,
      transactionType: 'deposit',
      amount: '3000.00',
      runningBalance: '3000.00',
      description: 'Retainer deposit — Williams dissolution',
      payorPayeeName: 'Sarah Williams',
      paymentMethod: 'ach',
      referenceNumber: 'ACH-88402',
      matterName: 'FL-2026-004',
      clientName: 'Sarah Williams',
      createdByName: 'Maria Lopez, Esq.',
    },
    /* 5. Chen retainer deposit */
    {
      entryGroupId: ENTRY_GROUP_5,
      trustAccountId: IOLTA_ACCOUNT_ID,
      clientLedgerId: LEDGER_CHEN_ID,
      transactionType: 'deposit',
      amount: '7500.00',
      runningBalance: '7500.00',
      description: 'Patent application retainer — Chen IP',
      payorPayeeName: 'David Chen',
      paymentMethod: 'wire',
      referenceNumber: 'WIR-20250122',
      matterName: 'IP-2026-005',
      clientName: 'David Chen',
      createdByName: 'James Park, Esq.',
    },
    /* 6. Johnson court filing disbursement */
    {
      entryGroupId: ENTRY_GROUP_6,
      trustAccountId: IOLTA_ACCOUNT_ID,
      clientLedgerId: LEDGER_JOHNSON_ID,
      transactionType: 'disbursement',
      amount: '-350.00',
      runningBalance: '4650.00',
      description: 'Court filing fee — Superior Court motion',
      payorPayeeName: 'Superior Court Clerk',
      paymentMethod: 'check',
      referenceNumber: 'CHK-FIRM-00112',
      matterName: 'PI-2026-001',
      clientName: 'Robert Johnson',
      createdByName: 'Sarah Mitchell, Esq.',
    },
    /* 7. Acme consulting payment */
    {
      entryGroupId: ENTRY_GROUP_7,
      trustAccountId: IOLTA_ACCOUNT_ID,
      clientLedgerId: LEDGER_ACME_ID,
      transactionType: 'disbursement',
      amount: '-2500.00',
      runningBalance: '7500.00',
      description: 'Expert consultant — corporate valuation',
      payorPayeeName: 'Hartley Business Consultants LLC',
      paymentMethod: 'wire',
      referenceNumber: 'WIR-FIRM-00045',
      matterName: 'BF-2026-002',
      clientName: 'Acme Corporation',
      createdByName: 'James Park, Esq.',
    },
    /* 8a. Garcia → Williams transfer (debit side) */
    {
      entryGroupId: ENTRY_GROUP_8,
      trustAccountId: IOLTA_ACCOUNT_ID,
      clientLedgerId: LEDGER_GARCIA_ID,
      transactionType: 'transfer_out',
      amount: '-1000.00',
      runningBalance: '24000.00',
      description: 'Transfer to Williams — family law referral fee',
      payorPayeeName: null,
      paymentMethod: null,
      referenceNumber: null,
      matterName: 'PR-2026-003',
      clientName: 'Garcia Estate',
      createdByName: 'Sarah Mitchell, Esq.',
    },
    /* 8b. Garcia → Williams transfer (credit side) */
    {
      entryGroupId: ENTRY_GROUP_8,
      trustAccountId: IOLTA_ACCOUNT_ID,
      clientLedgerId: LEDGER_WILLIAMS_ID,
      transactionType: 'transfer_in',
      amount: '1000.00',
      runningBalance: '4000.00',
      description: 'Transfer from Garcia — family law referral fee',
      payorPayeeName: null,
      paymentMethod: null,
      referenceNumber: null,
      matterName: 'FL-2026-004',
      clientName: 'Sarah Williams',
      createdByName: 'Sarah Mitchell, Esq.',
    },
    /* 9. Chen patent filing disbursement */
    {
      entryGroupId: '50000000-0000-0000-0000-000000000009',
      trustAccountId: IOLTA_ACCOUNT_ID,
      clientLedgerId: LEDGER_CHEN_ID,
      transactionType: 'disbursement',
      amount: '-1600.00',
      runningBalance: '5900.00',
      description: 'USPTO patent application filing fee',
      payorPayeeName: 'U.S. Patent and Trademark Office',
      paymentMethod: 'ach',
      referenceNumber: 'ACH-FIRM-00091',
      matterName: 'IP-2026-005',
      clientName: 'David Chen',
      createdByName: 'James Park, Esq.',
    },
  ];

  for (const entry of entries) {
    await client.query(`
      INSERT INTO journal_entries (
        entry_group_id, trust_account_id, client_ledger_id,
        transaction_type, amount, running_balance, description,
        reference_number, payor_payee_name, payment_method,
        matter_name, client_name, created_by_name
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
      )
    `, [
      entry.entryGroupId, entry.trustAccountId, entry.clientLedgerId,
      entry.transactionType, entry.amount, entry.runningBalance, entry.description,
      entry.referenceNumber, entry.payorPayeeName, entry.paymentMethod,
      entry.matterName, entry.clientName, entry.createdByName,
    ]);
  }
}

/**
 * Clean all seed data (reverse order for FK constraints).
 */
async function cleanSeedData(client: pg.PoolClient): Promise<void> {
  console.log('  → Cleaning existing data...');
  await client.query('DELETE FROM journal_entries');
  await client.query('DELETE FROM client_ledgers');
  await client.query('DELETE FROM trust_accounts');
}

/* ─── Main ───────────────────────────────────────────────────────── */

async function main(): Promise<void> {
  const shouldClean = process.argv.includes('--clean');

  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║  LexFlow Trust Service — Database Seed Script       ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log(`  Database: ${DATABASE_URL.replace(/\/\/[^@]*@/, '//***@')}`);
  console.log(`  Mode: ${shouldClean ? 'CLEAN + SEED' : 'SEED (additive)'}`);
  console.log('');

  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    if (shouldClean) {
      await cleanSeedData(client);
    }

    await seedTrustAccounts(client);
    await seedClientLedgers(client);
    await seedJournalEntries(client);

    await client.query('COMMIT');

    /* Summary */
    const accounts = await client.query('SELECT count(*) FROM trust_accounts');
    const ledgers = await client.query('SELECT count(*) FROM client_ledgers');
    const entries = await client.query('SELECT count(*) FROM journal_entries');
    const balance = await client.query(
      `SELECT COALESCE(SUM(amount::numeric), 0)::text as total FROM journal_entries WHERE is_voided = false`,
    );

    console.log('');
    console.log('  ✅ Seed complete!');
    console.log(`     Trust accounts:  ${(accounts.rows[0] as { count: string }).count}`);
    console.log(`     Client ledgers:  ${(ledgers.rows[0] as { count: string }).count}`);
    console.log(`     Journal entries: ${(entries.rows[0] as { count: string }).count}`);
    console.log(`     Total balance:   $${parseFloat((balance.rows[0] as { total: string }).total).toFixed(2)}`);
    console.log('');

    /* Per-ledger balances */
    const ledgerBalances = await client.query(`
      SELECT cl.matter_number, cl.client_name,
             COALESCE(SUM(je.amount::numeric), 0)::text as balance
      FROM client_ledgers cl
      LEFT JOIN journal_entries je ON je.client_ledger_id = cl.id AND je.is_voided = false
      GROUP BY cl.id, cl.matter_number, cl.client_name
      ORDER BY cl.matter_number
    `);

    console.log('  Ledger balances:');
    for (const row of ledgerBalances.rows) {
      const r = row as { matter_number: string; client_name: string; balance: string };
      console.log(`     ${r.matter_number.padEnd(15)} ${r.client_name.padEnd(25)} $${parseFloat(r.balance).toFixed(2)}`);
    }
    console.log('');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('  ❌ Seed failed:', error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error('Fatal error:', error);
  process.exitCode = 1;
});
