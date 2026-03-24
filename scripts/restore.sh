#!/usr/bin/env bash
# ============================================================================
# restore.sh — LexFlow Database Restore Script
# ============================================================================
#
# Restores a PostgreSQL database from a backup file.
# Supports both gzipped (.sql.gz) and plain SQL (.sql) backups.
#
# USAGE:
#   ./scripts/restore.sh <backup_file> [database_name]
#
# EXAMPLES:
#   ./scripts/restore.sh /var/backups/lexflow/lexflow_trust_20260324_020000.sql.gz
#   ./scripts/restore.sh /var/backups/lexflow/predeploy_trust_20260324.sql.gz lexflow_trust
#
# WARNING: This script drops and recreates the target database!
#
# REF: SPR-008 T-085 (Backup & Restore)
# ============================================================================

set -euo pipefail

# ── Argument Parsing ────────────────────────────────────────────────────────

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <backup_file> [database_name]"
  echo ""
  echo "  backup_file    Path to .sql or .sql.gz backup file"
  echo "  database_name  Target database (default: inferred from filename)"
  echo ""
  echo "Example:"
  echo "  $0 /var/backups/lexflow/lexflow_trust_20260324_020000.sql.gz"
  exit 1
fi

readonly BACKUP_FILE="$1"

# Infer database name from filename if not provided
if [[ $# -ge 2 ]]; then
  readonly DB_NAME="$2"
else
  # Extract DB name from filename: lexflow_trust_20260324... → lexflow_trust
  # Handle predeploy_trust_... → lexflow_trust
  BASENAME=$(basename "${BACKUP_FILE}" | sed 's/\.sql\.gz$//' | sed 's/\.sql$//')
  if [[ "${BASENAME}" == predeploy_trust_* ]]; then
    readonly DB_NAME="lexflow_trust"
  elif [[ "${BASENAME}" == predeploy_main_* ]]; then
    readonly DB_NAME="lexflow_main"
  else
    readonly DB_NAME=$(echo "${BASENAME}" | sed 's/_[0-9]\{8\}.*//')
  fi
fi

# ── Validation ──────────────────────────────────────────────────────────────

log() {
  echo "[$(date --iso-8601=seconds)] $1"
}

if [[ ! -f "${BACKUP_FILE}" ]]; then
  log "ERROR: Backup file not found: ${BACKUP_FILE}"
  exit 1
fi

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  LexFlow Database Restore                                  ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "  Backup file: ${BACKUP_FILE}"
echo "  Target DB:   ${DB_NAME}"
echo "  File size:   $(du -h "${BACKUP_FILE}" | cut -f1)"
echo ""

# ── Confirmation ────────────────────────────────────────────────────────────

log "⚠️  WARNING: This will DROP and RECREATE database '${DB_NAME}'!"
read -p "  Continue? (yes/no): " CONFIRM

if [[ "${CONFIRM}" != "yes" ]]; then
  log "Restore cancelled."
  exit 0
fi

# ── Restore ─────────────────────────────────────────────────────────────────

log "Terminating existing connections to ${DB_NAME}..."
psql -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${DB_NAME}' AND pid <> pg_backend_pid();" 2>/dev/null || true

log "Dropping and recreating ${DB_NAME}..."
dropdb --if-exists "${DB_NAME}"
createdb "${DB_NAME}"

log "Restoring from backup..."
if [[ "${BACKUP_FILE}" == *.gz ]]; then
  gunzip -c "${BACKUP_FILE}" | psql -q "${DB_NAME}"
else
  psql -q "${DB_NAME}" < "${BACKUP_FILE}"
fi

# ── Verification ────────────────────────────────────────────────────────────

log "Verifying restore..."

if [[ "${DB_NAME}" == "lexflow_trust" ]]; then
  ACCOUNTS=$(psql -qt "${DB_NAME}" -c "SELECT count(*) FROM trust_accounts;" 2>/dev/null | tr -d ' ' || echo "?")
  LEDGERS=$(psql -qt "${DB_NAME}" -c "SELECT count(*) FROM client_ledgers;" 2>/dev/null | tr -d ' ' || echo "?")
  ENTRIES=$(psql -qt "${DB_NAME}" -c "SELECT count(*) FROM journal_entries;" 2>/dev/null | tr -d ' ' || echo "?")
  log "  Trust accounts: ${ACCOUNTS}"
  log "  Client ledgers: ${LEDGERS}"
  log "  Journal entries: ${ENTRIES}"
else
  TABLE_COUNT=$(psql -qt "${DB_NAME}" -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';" 2>/dev/null | tr -d ' ' || echo "?")
  log "  Tables restored: ${TABLE_COUNT}"
fi

log "✅ Restore complete!"
