#!/usr/bin/env bash
# ============================================================================
# harden.sh — LexFlow Production VM Hardening Script
# ============================================================================
#
# One-time hardening for the lexflow-prod VM. Run with sudo.
# Idempotent — safe to re-run.
#
# USAGE:
#   sudo ./scripts/harden.sh
#
# WHAT IT DOES:
#   1. Configure UFW firewall (SSH, HTTP, HTTPS only)
#   2. Install and configure fail2ban (SSH brute-force protection)
#   3. Install Certbot for Let's Encrypt TLS
#   4. Set up log directory and logrotate
#   5. Set up backup directory and cron
#   6. Install PM2 cluster mode config
#
# PREREQUISITES:
#   - provision.sh has been run (Node.js, PM2, nginx, PostgreSQL installed)
#   - DNS A record points to this server's IP
#
# REF: SPR-008 T-076V (Production VM Hardening)
# REF: GOV-008 §3 (Infrastructure)
# ============================================================================

set -euo pipefail

log() {
  echo ""
  echo "▸ $1"
}

success() {
  echo "  ✓ $1"
}

# ── 1. Firewall (UFW) ──────────────────────────────────────────────────────

log "[1/6] Configuring UFW firewall..."
ufw --force reset >/dev/null 2>&1
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment 'SSH'
ufw allow 80/tcp comment 'HTTP (redirect to HTTPS)'
ufw allow 443/tcp comment 'HTTPS'
ufw --force enable
success "UFW enabled: SSH(22), HTTP(80), HTTPS(443)"

# ── 2. Fail2ban ─────────────────────────────────────────────────────────────

log "[2/6] Configuring fail2ban..."
if ! command -v fail2ban-client >/dev/null 2>&1; then
  apt-get update -qq && apt-get install -y -qq fail2ban
fi

cat > /etc/fail2ban/jail.local <<'EOF'
[sshd]
enabled = true
port = ssh
filter = sshd
logpath = /var/log/auth.log
maxretry = 5
bantime = 3600
findtime = 600
EOF

systemctl enable fail2ban
systemctl restart fail2ban
success "Fail2ban configured: SSH brute-force protection (5 attempts → 1h ban)"

# ── 3. Certbot / Let's Encrypt ──────────────────────────────────────────────

log "[3/6] Installing Certbot..."
if ! command -v certbot >/dev/null 2>&1; then
  apt-get update -qq && apt-get install -y -qq certbot python3-certbot-nginx
fi
success "Certbot installed"

echo "  ℹ  Run manually: sudo certbot certonly --nginx -d lexflow-prod.example.com"
echo "  ℹ  Then install: sudo cp scripts/nginx-ssl.conf /etc/nginx/sites-available/lexflow"

# Set up auto-renewal cron (certbot installs a timer by default, verify it exists)
if systemctl is-enabled certbot.timer >/dev/null 2>&1; then
  success "Certbot auto-renewal timer active"
else
  echo "  ⚠  Set up renewal: sudo systemctl enable certbot.timer"
fi

# ── 4. Log directory + logrotate ────────────────────────────────────────────

log "[4/6] Setting up log directory and logrotate..."
mkdir -p /var/log/lexflow
chmod 755 /var/log/lexflow
cp "$(dirname "$0")/logrotate.conf" /etc/logrotate.d/lexflow
success "Log directory /var/log/lexflow created, logrotate configured (14d retention)"

# ── 5. Backup directory + cron ──────────────────────────────────────────────

log "[5/6] Setting up backup directory and cron..."
mkdir -p /var/backups/lexflow
chmod 700 /var/backups/lexflow

# Add backup cron (daily at 2 AM) if not already present
CRON_LINE="0 2 * * * /opt/lexflow/backend/scripts/backup.sh >> /var/log/lexflow/backup.log 2>&1"
(crontab -l 2>/dev/null | grep -v "backup.sh" ; echo "${CRON_LINE}") | crontab -
success "Backup cron installed: daily at 2 AM, 7-day retention"

# ── 6. PM2 Cluster Mode ────────────────────────────────────────────────────

log "[6/6] Updating PM2 to cluster mode..."
BACKEND_DIR="/opt/lexflow/backend"
if [[ -d "${BACKEND_DIR}" ]]; then
  cd "${BACKEND_DIR}"
  pm2 delete all 2>/dev/null || true
  pm2 start scripts/ecosystem.config.js
  pm2 save
  success "PM2 running in cluster mode (2 instances per service)"
else
  echo "  ⚠  ${BACKEND_DIR} not found — PM2 update skipped"
fi

# ── Summary ─────────────────────────────────────────────────────────────────

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║  VM Hardening Complete!                         ║"
echo "╠══════════════════════════════════════════════════╣"
echo "║  UFW:       22, 80, 443 only                   ║"
echo "║  Fail2ban:  SSH protection (5 attempts → 1h)   ║"
echo "║  Certbot:   Installed (run certonly manually)   ║"
echo "║  Logs:      /var/log/lexflow/ (14d rotation)   ║"
echo "║  Backups:   /var/backups/lexflow/ (7d cron)    ║"
echo "║  PM2:       Cluster mode (2×2 instances)       ║"
echo "╚══════════════════════════════════════════════════╝"
