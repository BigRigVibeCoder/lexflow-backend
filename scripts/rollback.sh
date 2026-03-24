#!/usr/bin/env bash
# ============================================================================
# rollback.sh — LexFlow Production Rollback Script
# ============================================================================
#
# Rolls back to the previous deployment state:
# 1. Restores database from pre-deploy snapshot
# 2. Checks out previous git SHA
# 3. Rebuilds and reloads services
# 4. Verifies health
#
# USAGE:
#   ./scripts/rollback.sh [VM_HOST]
#
# PREREQUISITES:
#   - A deploy.sh run created /opt/lexflow/.deploy_state
#   - Pre-deploy snapshots exist in /var/backups/lexflow/
#
# REF: SPR-008 T-077V (Rollback Capability)
# ============================================================================

set -euo pipefail

readonly VM_HOST="${1:-lexflow-prod}"
readonly BACKEND_DIR="/opt/lexflow/backend"
readonly FRONTEND_DIR="/opt/lexflow/frontend"
readonly BACKUP_DIR="/var/backups/lexflow"
readonly STATE_FILE="/opt/lexflow/.deploy_state"
readonly HEALTH_TIMEOUT_SECONDS=30
readonly HEALTH_RETRY_INTERVAL_SECONDS=2

log_step() {
  echo ""
  echo "▸ $1"
}

log_success() {
  echo "  ✓ $1"
}

log_error() {
  echo "  ✗ ERROR: $1" >&2
}

remote_exec() {
  ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new "${VM_HOST}" "$@"
}

wait_for_health() {
  local url="$1"
  local service_name="$2"
  local elapsed=0

  echo "  → Waiting for ${service_name}..."
  while [[ $elapsed -lt $HEALTH_TIMEOUT_SECONDS ]]; do
    if remote_exec "curl -sf '${url}'" >/dev/null 2>&1; then
      log_success "${service_name} is healthy"
      return 0
    fi
    sleep "${HEALTH_RETRY_INTERVAL_SECONDS}"
    elapsed=$((elapsed + HEALTH_RETRY_INTERVAL_SECONDS))
  done

  log_error "${service_name} health check failed"
  return 1
}

# ── Pre-flight ──────────────────────────────────────────────────────────────

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  LexFlow ROLLBACK — Starting                               ║"
echo "║  Target: ${VM_HOST}                                        ║"
echo "╚══════════════════════════════════════════════════════════════╝"

log_step "[0/5] Reading deploy state..."
if ! remote_exec "test -f ${STATE_FILE}"; then
  log_error "No deploy state found at ${STATE_FILE}. Cannot rollback."
  exit 1
fi

# Source the deploy state variables
DEPLOY_STATE=$(remote_exec "cat ${STATE_FILE}")
eval "${DEPLOY_STATE}"
log_success "Rolling back to: backend=${PREV_BACKEND_SHA:0:7}, frontend=${PREV_FRONTEND_SHA:0:7}"
log_success "Using backup from: ${BACKUP_TIMESTAMP}"

# ── Step 1: Stop services ──────────────────────────────────────────────────

log_step "[1/5] Stopping all services..."
remote_exec "pm2 stop all" || true
log_success "Services stopped"

# ── Step 2: Restore databases ──────────────────────────────────────────────

log_step "[2/5] Restoring databases from pre-deploy snapshots..."

TRUST_BACKUP="${BACKUP_DIR}/predeploy_trust_${BACKUP_TIMESTAMP}.sql.gz"
MAIN_BACKUP="${BACKUP_DIR}/predeploy_main_${BACKUP_TIMESTAMP}.sql.gz"

if remote_exec "test -f ${TRUST_BACKUP}"; then
  remote_exec "dropdb --if-exists lexflow_trust_rollback && createdb lexflow_trust_rollback && gunzip -c ${TRUST_BACKUP} | psql -q lexflow_trust_rollback && dropdb lexflow_trust && psql -c 'ALTER DATABASE lexflow_trust_rollback RENAME TO lexflow_trust;'"
  log_success "lexflow_trust restored"
else
  log_error "Trust backup not found: ${TRUST_BACKUP}"
fi

if remote_exec "test -f ${MAIN_BACKUP}"; then
  remote_exec "dropdb --if-exists lexflow_main_rollback && createdb lexflow_main_rollback && gunzip -c ${MAIN_BACKUP} | psql -q lexflow_main_rollback && dropdb lexflow_main && psql -c 'ALTER DATABASE lexflow_main_rollback RENAME TO lexflow_main;'"
  log_success "lexflow_main restored"
else
  log_error "Main backup not found: ${MAIN_BACKUP}"
fi

# ── Step 3: Revert code ────────────────────────────────────────────────────

log_step "[3/5] Reverting to previous code versions..."
remote_exec "cd ${BACKEND_DIR} && git checkout ${PREV_BACKEND_SHA}"
remote_exec "cd ${FRONTEND_DIR} && git checkout ${PREV_FRONTEND_SHA}"
log_success "Code reverted"

# ── Step 4: Rebuild and restart ─────────────────────────────────────────────

log_step "[4/5] Rebuilding and restarting services..."
remote_exec "cd ${BACKEND_DIR} && npm install --production && npm run build"
remote_exec "cd ${FRONTEND_DIR} && npm install --production && npm run build"
remote_exec "pm2 start ${BACKEND_DIR}/scripts/ecosystem.config.js"
log_success "Services rebuilt and started"

# ── Step 5: Health checks ───────────────────────────────────────────────────

log_step "[5/5] Verifying health..."
wait_for_health "http://localhost:4000/health" "Trust Service"
wait_for_health "http://localhost:3000/api/health" "Web Service"

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  LexFlow ROLLBACK — Complete!                              ║"
echo "║  Backend:  ${PREV_BACKEND_SHA:0:7}    Frontend: ${PREV_FRONTEND_SHA:0:7}              ║"
echo "╚══════════════════════════════════════════════════════════════╝"
