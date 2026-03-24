-- Migration: Create Trust Accounting Schema (SPR-004 T-034)
--
-- Tables:
--   1. trust_accounts — bank accounts (IOLTA and operating)
--   2. client_ledgers — per-matter/client sub-ledgers
--   3. journal_entries — IMMUTABLE transaction records
--   4. bank_statements — imported bank statement headers
--   5. bank_statement_lines — individual bank transactions
--   6. reconciliation_sessions — reconciliation workflow
--   7. reconciliation_matches — bank-to-book matches
--
-- CRITICAL: journal_entries trigger enforces immutability.

BEGIN;

-- 1. Trust accounts
CREATE TABLE trust_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_name VARCHAR(255) NOT NULL,
  account_number VARCHAR(255) NOT NULL,
  routing_number VARCHAR(9) NOT NULL,
  account_name VARCHAR(255) NOT NULL,
  account_type VARCHAR(20) NOT NULL CHECK (account_type IN ('iolta', 'operating')),
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'frozen', 'closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Client ledgers
CREATE TABLE client_ledgers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trust_account_id UUID NOT NULL REFERENCES trust_accounts(id),
  matter_id UUID NOT NULL,
  client_id UUID NOT NULL,
  matter_number VARCHAR(100) NOT NULL,
  client_name VARCHAR(255) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_ledger_account_matter_client ON client_ledgers(trust_account_id, matter_id, client_id);
CREATE INDEX idx_ledger_trust_account ON client_ledgers(trust_account_id);

-- 3. Journal entries (IMMUTABLE)
CREATE TABLE journal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_group_id UUID NOT NULL,
  trust_account_id UUID NOT NULL REFERENCES trust_accounts(id),
  client_ledger_id UUID REFERENCES client_ledgers(id),
  transaction_type VARCHAR(30) NOT NULL CHECK (transaction_type IN ('deposit', 'disbursement', 'transfer_in', 'transfer_out', 'fee_transfer', 'void')),
  amount NUMERIC(15,2) NOT NULL,
  running_balance NUMERIC(15,2) NOT NULL,
  description TEXT NOT NULL,
  reference_number VARCHAR(255),
  payor_payee_name VARCHAR(255),
  payment_method VARCHAR(30) CHECK (payment_method IN ('check', 'wire', 'ach', 'cash', 'other')),
  matter_name VARCHAR(255),
  client_name VARCHAR(255),
  created_by_name VARCHAR(255) NOT NULL,
  is_voided BOOLEAN NOT NULL DEFAULT false,
  voided_by_entry_id UUID,
  voided_by_name VARCHAR(255),
  voided_at TIMESTAMPTZ,
  void_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_journal_account_created ON journal_entries(trust_account_id, created_at);
CREATE INDEX idx_journal_ledger_created ON journal_entries(client_ledger_id, created_at);
CREATE INDEX idx_journal_entry_group ON journal_entries(entry_group_id);

-- Journal entry immutability trigger
-- Allows void-marking (is_voided, voided_by_*, void_reason) but blocks financial data changes
CREATE OR REPLACE FUNCTION prevent_journal_entry_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'journal_entries are immutable — DELETE is prohibited.';
    RETURN NULL;
  END IF;

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

CREATE TRIGGER trg_journal_entries_immutable
  BEFORE UPDATE OR DELETE ON journal_entries
  FOR EACH ROW
  EXECUTE FUNCTION prevent_journal_entry_mutation();

-- 4. Bank statements
CREATE TABLE bank_statements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trust_account_id UUID NOT NULL REFERENCES trust_accounts(id),
  statement_date TIMESTAMPTZ NOT NULL,
  imported_by_name VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Bank statement lines
CREATE TABLE bank_statement_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_statement_id UUID NOT NULL REFERENCES bank_statements(id),
  trust_account_id UUID NOT NULL REFERENCES trust_accounts(id),
  date TIMESTAMPTZ NOT NULL,
  description TEXT NOT NULL,
  amount NUMERIC(15,2) NOT NULL,
  external_id VARCHAR(255) NOT NULL,
  check_number VARCHAR(50),
  is_reconciled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_bank_line_external_id ON bank_statement_lines(trust_account_id, external_id);

-- 6. Reconciliation sessions
CREATE TABLE reconciliation_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trust_account_id UUID NOT NULL REFERENCES trust_accounts(id),
  statement_end_date TIMESTAMPTZ NOT NULL,
  statement_end_balance NUMERIC(15,2) NOT NULL,
  book_balance NUMERIC(15,2) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'balanced', 'unbalanced', 'completed')),
  prepared_by_name VARCHAR(255) NOT NULL,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Reconciliation matches
CREATE TABLE reconciliation_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reconciliation_id UUID NOT NULL REFERENCES reconciliation_sessions(id),
  bank_statement_line_id UUID NOT NULL REFERENCES bank_statement_lines(id),
  journal_entry_id UUID NOT NULL REFERENCES journal_entries(id),
  match_type VARCHAR(20) NOT NULL CHECK (match_type IN ('auto', 'manual')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMIT;
