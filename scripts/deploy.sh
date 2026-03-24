#!/usr/bin/env bash
# ============================================================================
# deploy.sh — LexFlow Production Deployment Script
# ============================================================================
#
# Deploys both services to the lexflow-prod VM with zero-downtime.
# Deploy order is CRITICAL: trust → web (trust DB must be migrated first).
#
# FEATURES:
#   - Pre-deploy pg_dump snapshot (for rollback)
#   - Zero-downtime restart (PM2 reload)
#   - Health check with automatic rollback trigger
#   - Saves previous git SHA for rollback
#
# USAGE:
#   ./scripts/deploy.sh [VM_HOST]
#
# PREREQUISITES:
#   - SSH key-based access to VM_HOST
#   - provision.sh + harden.sh have been run on the VM
#   - Both repos cloned to /opt/lexflow/{backend,frontend}
#
# REF: SPR-008 T-077V (Production Deploy Automation)
# REF: SPR-001 T-006V (Deployment Script)
# REF: GOV-008 §3 (Infrastructure)
# ============================================================================

set -euo pipefail

# ── Constants ───────────────────────────────────────────────────────────────

readonly VM_HOST="${1:-lexflow-prod}"
readonly BACKEND_DIR="/opt/lexflow/backend"
readonly FRONTEND_DIR="/opt/lexflow/frontend"
readonly BACKUP_DIR="/var/backups/lexflow"
readonly STATE_FILE="/opt/lexflow/.deploy_state"
readonly HEALTH_TIMEOUT_SECONDS=30
readonly HEALTH_RETRY_INTERVAL_SECONDS=2

# ── Helper Functions ────────────────────────────────────────────────────────

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

  echo "  → Waiting for ${service_name} health check (${url})..."

  while [[ $elapsed -lt $HEALTH_TIMEOUT_SECONDS ]]; do
    if remote_exec "curl -sf '${url}'" >/dev/null 2>&1; then
      log_success "${service_name} is healthy"
      return 0
    fi
    sleep "${HEALTH_RETRY_INTERVAL_SECONDS}"
    elapsed=$((elapsed + HEALTH_RETRY_INTERVAL_SECONDS))
  done

  log_error "${service_name} health check failed after ${HEALTH_TIMEOUT_SECONDS}s"
  return 1
}

# ── Pre-flight ──────────────────────────────────────────────────────────────

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  LexFlow Deployment — Starting                             ║"
echo "║  Target: ${VM_HOST}                                        ║"
echo "╚══════════════════════════════════════════════════════════════╝"

log_step "[0/8] Verifying SSH connectivity..."
if ! remote_exec "echo 'SSH OK'" >/dev/null 2>&1; then
  log_error "Cannot connect to ${VM_HOST} via SSH"
  exit 1
fi
log_success "Connected to ${VM_HOST}"

# ── Step 1: Pre-deploy snapshot ─────────────────────────────────────────────

log_step "[1/8] Creating pre-deploy database snapshot..."
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
remote_exec "mkdir -p ${BACKUP_DIR} && pg_dump lexflow_trust | gzip > ${BACKUP_DIR}/predeploy_trust_${TIMESTAMP}.sql.gz && pg_dump lexflow_main | gzip > ${BACKUP_DIR}/predeploy_main_${TIMESTAMP}.sql.gz"
log_success "Pre-deploy snapshots saved to ${BACKUP_DIR}/predeploy_*_${TIMESTAMP}.sql.gz"

# ── Step 2: Save current state for rollback ─────────────────────────────────

log_step "[2/8] Saving current state for rollback..."
PREV_BACKEND_SHA=$(remote_exec "cd ${BACKEND_DIR} && git rev-parse HEAD")
PREV_FRONTEND_SHA=$(remote_exec "cd ${FRONTEND_DIR} && git rev-parse HEAD")
remote_exec "cat > ${STATE_FILE} <<EOF
PREV_BACKEND_SHA=${PREV_BACKEND_SHA}
PREV_FRONTEND_SHA=${PREV_FRONTEND_SHA}
BACKUP_TIMESTAMP=${TIMESTAMP}
DEPLOY_TIME=$(date --iso-8601=seconds)
EOF"
log_success "Deploy state saved (backend: ${PREV_BACKEND_SHA:0:7}, frontend: ${PREV_FRONTEND_SHA:0:7})"

# ── Step 3: Deploy Trust Service (Backend) ──────────────────────────────────

log_step "[3/8] Pulling latest backend code..."
remote_exec "cd ${BACKEND_DIR} && git pull origin main"
log_success "Backend code updated"

log_step "[4/8] Installing backend dependencies and building..."
remote_exec "cd ${BACKEND_DIR} && npm install --production && npm run build"
log_success "Backend built"

log_step "[5/8] Running trust DB migrations..."
remote_exec "cd ${BACKEND_DIR} && npx drizzle-kit migrate"
log_success "Trust DB migrations complete"

log_step "[6/8] Reloading trust service (zero-downtime)..."
remote_exec "cd ${BACKEND_DIR} && pm2 reload lexflow-trust || pm2 start scripts/ecosystem.config.js --only lexflow-trust"
if ! wait_for_health "http://localhost:4000/health" "Trust Service"; then
  log_error "Trust service health check FAILED — run scripts/rollback.sh ${VM_HOST}"
  exit 1
fi

# ── Step 4: Deploy Web Service (Frontend) ───────────────────────────────────

log_step "[7/8] Pulling, building, and reloading frontend..."
remote_exec "cd ${FRONTEND_DIR} && git pull origin main && npm install --production && npm run build"
remote_exec "cd ${FRONTEND_DIR} && npx drizzle-kit migrate"
remote_exec "cd ${FRONTEND_DIR} && pm2 reload lexflow-web || pm2 start ${BACKEND_DIR}/scripts/ecosystem.config.js --only lexflow-web"

log_step "[8/8] Final health checks..."
wait_for_health "http://localhost:4000/health" "Trust Service"
if ! wait_for_health "http://localhost:3000/api/health" "Web Service"; then
  log_error "Web service health check FAILED — run scripts/rollback.sh ${VM_HOST}"
  exit 1
fi

# ── Summary ─────────────────────────────────────────────────────────────────

NEW_BACKEND_SHA=$(remote_exec "cd ${BACKEND_DIR} && git rev-parse --short HEAD")
NEW_FRONTEND_SHA=$(remote_exec "cd ${FRONTEND_DIR} && git rev-parse --short HEAD")

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  LexFlow Deployment — Complete!                            ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║  Trust Service: http://localhost:4000/health  ✓             ║"
echo "║  Web Service:   http://localhost:3000/api/health  ✓         ║"
echo "║  Backend SHA:   ${NEW_BACKEND_SHA}                                   ║"
echo "║  Frontend SHA:  ${NEW_FRONTEND_SHA}                                   ║"
echo "║  Rollback:      scripts/rollback.sh ${VM_HOST}              ║"
echo "╚══════════════════════════════════════════════════════════════╝"
