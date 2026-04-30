#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/docker-compose.vm.yml}"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.production}"
PROJECT_NAME="${COMPOSE_PROJECT_NAME:-dovetail}"
BACKUP_ROOT="${BACKUP_ROOT:-/var/backups/dovetail}"
BACKUP_TIER="${BACKUP_TIER:-auto}"

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing env file: $ENV_FILE" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

POSTGRES_DB="${POSTGRES_DB:-dovetail}"
POSTGRES_USER="${POSTGRES_USER:-dovetail}"

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
day_of_week="$(date -u +%u)"
day_of_month="$(date -u +%d)"

if [ "$BACKUP_TIER" = "auto" ]; then
  if [ "$day_of_month" = "01" ]; then
    BACKUP_TIER="monthly"
  elif [ "$day_of_week" = "7" ]; then
    BACKUP_TIER="weekly"
  else
    BACKUP_TIER="daily"
  fi
fi

case "$BACKUP_TIER" in
  daily|weekly|monthly) ;;
  *)
    echo "BACKUP_TIER must be daily, weekly, monthly, or auto" >&2
    exit 1
    ;;
esac

backup_dir="$BACKUP_ROOT/$BACKUP_TIER"
archive="$backup_dir/dovetail-$BACKUP_TIER-$timestamp.tar.gz"
tmp_dir="$(mktemp -d)"

cleanup() {
  rm -rf "$tmp_dir"
}
trap cleanup EXIT

mkdir -p "$backup_dir"

compose() {
  docker compose --env-file "$ENV_FILE" -p "$PROJECT_NAME" -f "$COMPOSE_FILE" "$@"
}

echo "Creating PostgreSQL dump"
compose exec -T postgres pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc > "$tmp_dir/postgres.dump"

echo "Archiving uploads volume"
docker run --rm \
  -v "${PROJECT_NAME}_uploads_data:/uploads:ro" \
  -v "$tmp_dir:/backup" \
  alpine:3.20 \
  sh -c "cd /uploads && tar -czf /backup/uploads.tar.gz ."

cat > "$tmp_dir/manifest.txt" <<MANIFEST
created_at=$timestamp
tier=$BACKUP_TIER
project=$PROJECT_NAME
postgres_db=$POSTGRES_DB
postgres_user=$POSTGRES_USER
git_sha=$(git -C "$ROOT_DIR" rev-parse --short HEAD 2>/dev/null || echo unknown)
compose_file=$(basename "$COMPOSE_FILE")
MANIFEST

tar -czf "$archive" -C "$tmp_dir" postgres.dump uploads.tar.gz manifest.txt
chmod 0600 "$archive"

find "$BACKUP_ROOT/daily" -type f -name 'dovetail-daily-*.tar.gz' -mtime +7 -delete 2>/dev/null || true
find "$BACKUP_ROOT/weekly" -type f -name 'dovetail-weekly-*.tar.gz' -mtime +49 -delete 2>/dev/null || true
find "$BACKUP_ROOT/monthly" -type f -name 'dovetail-monthly-*.tar.gz' -mtime +220 -delete 2>/dev/null || true

echo "Backup written: $archive"
