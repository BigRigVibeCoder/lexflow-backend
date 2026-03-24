#!/usr/bin/env bash
# ============================================================================
# backup.sh — LexFlow PostgreSQL Backup Script
# ============================================================================
#
# Creates compressed pg_dump backups for both databases.
# Designed to be run via cron daily. Rotates backups older than 7 days.
#
# USAGE:
#   ./scripts/backup.sh                    # backup both databases
#   ./scripts/backup.sh lexflow_trust      # backup only trust DB
#
# CRON ENTRY (daily at 2 AM):
#   0 2 * * * /opt/lexflow/backend/scripts/backup.sh >> /var/log/lexflow/backup.log 2>&1
#
# REF: SPR-008 T-076V (pg_dump cron)
# REF: SPR-008 T-085 (Backup & Restore)
# ============================================================================

set -euo pipefail

# ── Configuration ───────────────────────────────────────────────────────────

readonly BACKUP_DIR="/var/backups/lexflow"
readonly RETENTION_DAYS=7
readonly DATABASES=("${@:-lexflow_trust lexflow_main}")
readonly TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# ── Functions ───────────────────────────────────────────────────────────────

log() {
  echo "[$(date --iso-8601=seconds)] $1"
}

error() {
  echo "[$(date --iso-8601=seconds)] ERROR: $1" >&2
}

backup_database() {
  local db_name="$1"
  local backup_file="${BACKUP_DIR}/${db_name}_${TIMESTAMP}.sql.gz"

  log "Backing up ${db_name}..."

  if pg_dump "${db_name}" | gzip > "${backup_file}"; then
    local size
    size=$(du -h "${backup_file}" | cut -f1)
    log "  ✓ ${db_name} → ${backup_file} (${size})"
  else
    error "pg_dump failed for ${db_name}"
    return 1
  fi
}

rotate_backups() {
  log "Rotating backups older than ${RETENTION_DAYS} days..."
  local count
  count=$(find "${BACKUP_DIR}" -name "*.sql.gz" -type f -mtime +${RETENTION_DAYS} | wc -l)

  if [[ "${count}" -gt 0 ]]; then
    find "${BACKUP_DIR}" -name "*.sql.gz" -type f -mtime +${RETENTION_DAYS} -delete
    log "  ✓ Removed ${count} old backup(s)"
  else
    log "  ✓ No old backups to remove"
  fi
}

# ── Main ────────────────────────────────────────────────────────────────────

log "╔══════════════════════════════════════════════════╗"
log "║  LexFlow Database Backup                        ║"
log "╚══════════════════════════════════════════════════╝"

# Ensure backup directory exists
mkdir -p "${BACKUP_DIR}"

# Parse databases argument
if [[ $# -gt 0 ]]; then
  dbs=("$@")
else
  dbs=("lexflow_trust" "lexflow_main")
fi

# Backup each database
failures=0
for db in "${dbs[@]}"; do
  if ! backup_database "${db}"; then
    failures=$((failures + 1))
  fi
done

# Rotate old backups
rotate_backups

# Summary
if [[ ${failures} -eq 0 ]]; then
  log "✅ Backup complete. ${#dbs[@]} database(s) backed up."
else
  error "Backup completed with ${failures} failure(s)."
  exit 1
fi
