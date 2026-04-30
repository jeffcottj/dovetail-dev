#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/docker-compose.vm.yml}"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.production}"
PROJECT_NAME="${COMPOSE_PROJECT_NAME:-dovetail}"
BACKUP_ARCHIVE="${1:-}"
DRY_RUN="${DRY_RUN:-false}"

if [ -z "$BACKUP_ARCHIVE" ]; then
  echo "Usage: $0 /path/to/dovetail-backup.tar.gz" >&2
  exit 1
fi

if [ ! -f "$BACKUP_ARCHIVE" ]; then
  echo "Backup archive not found: $BACKUP_ARCHIVE" >&2
  exit 1
fi

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
tmp_dir="$(mktemp -d)"

cleanup() {
  rm -rf "$tmp_dir"
}
trap cleanup EXIT

compose() {
  docker compose --env-file "$ENV_FILE" -p "$PROJECT_NAME" -f "$COMPOSE_FILE" "$@"
}

tar -xzf "$BACKUP_ARCHIVE" -C "$tmp_dir"

for required in postgres.dump uploads.tar.gz manifest.txt; do
  if [ ! -f "$tmp_dir/$required" ]; then
    echo "Backup archive is missing $required" >&2
    exit 1
  fi
done

echo "Backup manifest:"
cat "$tmp_dir/manifest.txt"

if [ "$DRY_RUN" = "true" ]; then
  echo "Dry run complete; no data was restored."
  exit 0
fi

echo
echo "This will replace the Dovetail database and uploads volume for project '$PROJECT_NAME'."
read -r -p "Type RESTORE to continue: " confirmation
if [ "$confirmation" != "RESTORE" ]; then
  echo "Restore cancelled."
  exit 1
fi

echo "Stopping write-capable services"
compose stop web api mcp
compose up -d postgres

echo "Restoring PostgreSQL database"
compose exec -T postgres dropdb -U "$POSTGRES_USER" --if-exists "$POSTGRES_DB"
compose exec -T postgres createdb -U "$POSTGRES_USER" "$POSTGRES_DB"
compose exec -T postgres pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner < "$tmp_dir/postgres.dump"

echo "Restoring uploads volume"
docker run --rm \
  -v "${PROJECT_NAME}_uploads_data:/uploads" \
  -v "$tmp_dir:/backup:ro" \
  alpine:3.20 \
  sh -c "rm -rf /uploads/* && cd /uploads && tar -xzf /backup/uploads.tar.gz"

echo "Restarting services"
compose up -d
compose ps

echo "Restore complete. Check readiness with: curl -fsS https://$DOVETAIL_DOMAIN/api/health"
