/**
 * ecosystem.config.js — PM2 Process Configuration
 *
 * Manages both LexFlow services on the production VM.
 *
 * USAGE:
 *   pm2 start scripts/ecosystem.config.js
 *   pm2 status
 *   pm2 restart lexflow-trust
 *
 * REF: AGT-003-BE §2 (Process Manager: PM2)
 * REF: SPR-001 T-004V (VM Provisioning)
 * REF: GOV-008 §3.2 (PM2 deployment)
 */

module.exports = {
  apps: [
    {
      name: 'lexflow-trust',
      cwd: '/opt/lexflow/backend',
      script: 'dist/index.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 4000,
        SERVICE_NAME: 'lexflow-trust',
        LOG_LEVEL: 'warn',
      },
      /* Restart policy */
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 5000,
      /* Logging — PM2 writes to /root/.pm2/logs/ by default */
      log_date_format: 'YYYY-MM-DD HH:mm:ss.SSS',
      merge_logs: true,
      /* Memory limit — restart if exceeded */
      max_memory_restart: '512M',
    },
    {
      name: 'lexflow-web',
      cwd: '/opt/lexflow/frontend',
      script: 'node_modules/.bin/next',
      args: 'start',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 5000,
      log_date_format: 'YYYY-MM-DD HH:mm:ss.SSS',
      merge_logs: true,
      max_memory_restart: '1G',
    },
  ],
};
