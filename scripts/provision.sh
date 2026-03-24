#!/usr/bin/env bash
# ============================================================================
# provision.sh — LexFlow Production VM Provisioning Script
# ============================================================================
#
# Installs and configures all required services on a fresh Ubuntu 22.04 VM.
#
# USAGE:
#   chmod +x scripts/provision.sh
#   sudo ./scripts/provision.sh
#
# WHAT THIS SCRIPT DOES:
#   1. Installs PostgreSQL 15 and creates databases/users
#   2. Installs Node.js 20 LTS via NodeSource
#   3. Installs PM2 globally
#   4. Configures nginx reverse proxy
#   5. Creates document storage directory
#   6. Configures UFW firewall
#
# REF: GOV-008 §3 (Infrastructure)
# REF: SPR-001 T-004V (VM Provisioning Scripts)
# ============================================================================

set -euo pipefail

# ── Constants ───────────────────────────────────────────────────────────────

readonly LEXFLOW_USER="lexflow"
readonly PG_VERSION="15"
readonly NODE_MAJOR="20"
readonly DB_MAIN="lexflow_main"
readonly DB_TRUST="lexflow_trust"
readonly DB_USER_WEB="lexflow_web"
readonly DB_USER_TRUST="lexflow_trust"
readonly DOC_STORAGE_DIR="/var/lexflow/documents"
readonly APP_DIR="/opt/lexflow"

# ── Pre-flight checks ──────────────────────────────────────────────────────

if [[ $EUID -ne 0 ]]; then
  echo "ERROR: This script must be run as root (sudo)." >&2
  exit 1
fi

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  LexFlow VM Provisioning — Starting                        ║"
echo "╚══════════════════════════════════════════════════════════════╝"

# ── 1. System Updates ──────────────────────────────────────────────────────

echo ""
echo "▸ [1/6] Updating system packages..."
apt-get update -qq
apt-get upgrade -y -qq

# ── 2. PostgreSQL 15 ──────────────────────────────────────────────────────

echo ""
echo "▸ [2/6] Installing PostgreSQL ${PG_VERSION}..."

# Add PostgreSQL APT repository
apt-get install -y -qq curl ca-certificates gnupg lsb-release
curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /usr/share/keyrings/postgresql-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/postgresql-keyring.gpg] http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list
apt-get update -qq
apt-get install -y -qq "postgresql-${PG_VERSION}"

# Start and enable PostgreSQL
systemctl enable postgresql
systemctl start postgresql

# Create databases and users
echo "  → Creating databases and users..."
sudo -u postgres psql -c "CREATE USER ${DB_USER_WEB} WITH PASSWORD 'changeme_web';" 2>/dev/null || echo "  → User ${DB_USER_WEB} already exists"
sudo -u postgres psql -c "CREATE USER ${DB_USER_TRUST} WITH PASSWORD 'changeme_trust';" 2>/dev/null || echo "  → User ${DB_USER_TRUST} already exists"
sudo -u postgres psql -c "CREATE DATABASE ${DB_MAIN} OWNER ${DB_USER_WEB};" 2>/dev/null || echo "  → Database ${DB_MAIN} already exists"
sudo -u postgres psql -c "CREATE DATABASE ${DB_TRUST} OWNER ${DB_USER_TRUST};" 2>/dev/null || echo "  → Database ${DB_TRUST} already exists"

echo "  ✓ PostgreSQL ${PG_VERSION} configured"

# ── 3. Node.js 20 LTS ────────────────────────────────────────────────────

echo ""
echo "▸ [3/6] Installing Node.js ${NODE_MAJOR} LTS..."

curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
apt-get install -y -qq nodejs

echo "  → Node.js version: $(node --version)"
echo "  → npm version: $(npm --version)"

# Install PM2 globally
echo "  → Installing PM2..."
npm install -g pm2
pm2 startup systemd -u "${LEXFLOW_USER}" --hp "/home/${LEXFLOW_USER}" 2>/dev/null || true

echo "  ✓ Node.js ${NODE_MAJOR} + PM2 installed"

# ── 4. nginx ──────────────────────────────────────────────────────────────

echo ""
echo "▸ [4/6] Configuring nginx..."

apt-get install -y -qq nginx

# Copy LexFlow nginx config
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cp "${SCRIPT_DIR}/nginx.conf" /etc/nginx/sites-available/lexflow
ln -sf /etc/nginx/sites-available/lexflow /etc/nginx/sites-enabled/lexflow
rm -f /etc/nginx/sites-enabled/default

# Test and restart nginx
nginx -t
systemctl enable nginx
systemctl restart nginx

echo "  ✓ nginx configured"

# ── 5. Document Storage ──────────────────────────────────────────────────

echo ""
echo "▸ [5/6] Creating document storage directory..."

# Create lexflow system user if it doesn't exist
id -u "${LEXFLOW_USER}" &>/dev/null || useradd --system --create-home "${LEXFLOW_USER}"

mkdir -p "${DOC_STORAGE_DIR}"
chown "${LEXFLOW_USER}:${LEXFLOW_USER}" "${DOC_STORAGE_DIR}"
chmod 750 "${DOC_STORAGE_DIR}"

# Create application directories
mkdir -p "${APP_DIR}/backend"
mkdir -p "${APP_DIR}/frontend"
chown -R "${LEXFLOW_USER}:${LEXFLOW_USER}" "${APP_DIR}"

echo "  ✓ Document storage at ${DOC_STORAGE_DIR}"
echo "  ✓ Application directory at ${APP_DIR}"

# ── 6. UFW Firewall ─────────────────────────────────────────────────────

echo ""
echo "▸ [6/6] Configuring UFW firewall..."

ufw --force enable
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp   # SSH
ufw allow 80/tcp   # HTTP
ufw allow 443/tcp  # HTTPS

echo "  ✓ UFW configured: allow 22, 80, 443 only"

# ── Summary ──────────────────────────────────────────────────────────────

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  LexFlow VM Provisioning — Complete!                       ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║  PostgreSQL ${PG_VERSION}:                                         ║"
echo "║    • ${DB_MAIN} (owner: ${DB_USER_WEB})                  ║"
echo "║    • ${DB_TRUST} (owner: ${DB_USER_TRUST})              ║"
echo "║  Node.js: $(node --version)                                     ║"
echo "║  PM2: installed globally                                   ║"
echo "║  nginx: reverse proxy configured                           ║"
echo "║  UFW: ports 22, 80, 443                                    ║"
echo "║  Documents: ${DOC_STORAGE_DIR}                 ║"
echo "║                                                            ║"
echo "║  ⚠ NEXT STEPS:                                             ║"
echo "║    1. Update DB passwords in PostgreSQL                    ║"
echo "║    2. Set up SSL/TLS certificates                          ║"
echo "║    3. Configure .env files in ${APP_DIR}            ║"
echo "╚══════════════════════════════════════════════════════════════╝"
