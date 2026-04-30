#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CRON_FILE="${CRON_FILE:-/etc/cron.d/dovetail-backup}"
BACKUP_SCRIPT="$ROOT_DIR/deploy/scripts/backup.sh"

cat > "$CRON_FILE" <<CRON
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

# Dovetail backup policy:
# - daily backups retained for 7 days
# - weekly backups retained for 7 weeks
# - monthly backups retained for about 7 months
15 2 * * * root ENV_FILE=$ROOT_DIR/.env.production COMPOSE_FILE=$ROOT_DIR/docker-compose.vm.yml COMPOSE_PROJECT_NAME=dovetail BACKUP_TIER=auto $BACKUP_SCRIPT >> /var/log/dovetail-backup.log 2>&1
CRON

chmod 0644 "$CRON_FILE"
echo "Installed $CRON_FILE"
