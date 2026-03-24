# LexFlow Backup & Restore Procedures

> Production database backup and restore for `lexflow_trust` and `lexflow_main`.
> REF: SPR-008 T-085

---

## Automated Daily Backups

Backups run automatically via cron (installed by `scripts/harden.sh`):

| Setting | Value |
|:--------|:------|
| Schedule | Daily at 2:00 AM |
| Location | `/var/backups/lexflow/` |
| Format | gzipped SQL (`dbname_YYYYMMDD_HHMMSS.sql.gz`) |
| Retention | 7 days (auto-rotated) |
| Databases | `lexflow_trust`, `lexflow_main` |
| Script | `scripts/backup.sh` |

**Cron entry:**
```
0 2 * * * /opt/lexflow/backend/scripts/backup.sh >> /var/log/lexflow/backup.log 2>&1
```

---

## Manual Backup

```bash
# Backup both databases
./scripts/backup.sh

# Backup only the trust database
./scripts/backup.sh lexflow_trust
```

Verify backup:
```bash
ls -lh /var/backups/lexflow/
# lexflow_trust_20260324_020000.sql.gz   1.2M
# lexflow_main_20260324_020000.sql.gz    3.4M
```

---

## Restore Procedure

### Standard Restore

```bash
# Interactive — prompts for confirmation
./scripts/restore.sh /var/backups/lexflow/lexflow_trust_20260324_020000.sql.gz

# With explicit database name
./scripts/restore.sh /var/backups/lexflow/backup.sql.gz lexflow_trust
```

### Emergency Restore (from deploy rollback snapshot)

```bash
# Restore pre-deploy snapshots
./scripts/restore.sh /var/backups/lexflow/predeploy_trust_20260324_120000.sql.gz
./scripts/restore.sh /var/backups/lexflow/predeploy_main_20260324_120000.sql.gz
```

### Full Disaster Recovery

1. **Stop services:**
   ```bash
   pm2 stop all
   ```

2. **Restore both databases:**
   ```bash
   ./scripts/restore.sh /var/backups/lexflow/lexflow_trust_LATEST.sql.gz
   ./scripts/restore.sh /var/backups/lexflow/lexflow_main_LATEST.sql.gz
   ```

3. **Restart services:**
   ```bash
   pm2 start scripts/ecosystem.config.js
   ```

4. **Verify health:**
   ```bash
   curl http://localhost:4000/health
   curl http://localhost:3000/api/health
   ```

---

## Verification Test

To verify the backup/restore pipeline works:

```bash
# 1. Create test data
npx tsx scripts/seed.ts

# 2. Backup
./scripts/backup.sh lexflow_trust

# 3. Drop and restore
./scripts/restore.sh /var/backups/lexflow/lexflow_trust_*.sql.gz

# 4. Verify — should show same counts as before
psql lexflow_trust -c "SELECT count(*) FROM trust_accounts;"
psql lexflow_trust -c "SELECT count(*) FROM client_ledgers;"
psql lexflow_trust -c "SELECT count(*) FROM journal_entries;"
```

---

## Monitoring

Check backup logs:
```bash
tail -50 /var/log/lexflow/backup.log
```

Check backup sizes (detect corruption if size drops to 0):
```bash
ls -lhS /var/backups/lexflow/
```
