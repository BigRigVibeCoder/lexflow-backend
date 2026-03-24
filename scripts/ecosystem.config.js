/**
 * ecosystem.config.js — PM2 Process Configuration
 *
 * Manages both LexFlow services on the production VM.
 * Uses cluster mode for zero-downtime deploys (PM2 reload).
 *
 * USAGE:
 *   pm2 start scripts/ecosystem.config.js
 *   pm2 status
 *   pm2 reload lexflow-trust   # zero-downtime restart
 *
 * REF: AGT-003-BE §2 (Process Manager: PM2)
 * REF: SPR-001 T-004V (VM Provisioning)
 * REF: SPR-008 T-076V (PM2 cluster mode, 2 instances per service)
 * REF: GOV-008 §3.2 (PM2 deployment)
 */

module.exports = {
  apps: [
    {
      name: 'lexflow-trust',
      cwd: '/opt/lexflow/backend',
      script: 'dist/index.js',
      instances: 2,
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 4000,
        SERVICE_NAME: 'lexflow-trust',
        LOG_LEVEL: 'info',
        LOG_FILE: '/var/log/lexflow/trust.log',
      },
      /* Restart policy */
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 5000,
      /* Logging — PM2 manages stdout/stderr logs */
      log_date_format: 'YYYY-MM-DD HH:mm:ss.SSS',
      merge_logs: true,
      /* Memory limit — restart if exceeded */
      max_memory_restart: '512M',
      /* Graceful shutdown */
      kill_timeout: 5000,
      listen_timeout: 10000,
    },
    {
      name: 'lexflow-web',
      cwd: '/opt/lexflow/frontend',
      script: 'node_modules/.bin/next',
      args: 'start',
      instances: 2,
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        LOG_FILE: '/var/log/lexflow/web.log',
      },
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 5000,
      log_date_format: 'YYYY-MM-DD HH:mm:ss.SSS',
      merge_logs: true,
      max_memory_restart: '1G',
      kill_timeout: 5000,
      listen_timeout: 10000,
    },
  ],
};
