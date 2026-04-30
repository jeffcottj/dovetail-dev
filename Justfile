set shell := ["bash", "-c"]

default:
  @just --list

ensure-env:
  if [ ! -f .env ]; then cp .env.example .env; fi

install-deps:
  if [ ! -d node_modules ]; then pnpm install; fi

doctor:
  node scripts/dev/doctor.mjs

db-up:
  node scripts/dev/db-up.mjs

migrate:
  node scripts/dev/migrate.mjs

seed:
  pnpm --filter @dovetail/db db:seed

setup: ensure-env install-deps doctor db-up migrate seed
  @echo "Local setup complete."

db-reset:
  docker compose down -v
  docker compose up -d postgres --wait
  just migrate
  just seed

dev:
  just db-up
  just migrate
  just seed
  pnpm dev

logs-db:
  docker compose logs -f postgres

stack:
  docker compose up --build

stack-logs:
  docker compose logs -f postgres api web mcp

mcp-dev:
  pnpm --filter @dovetail/mcp dev

mcp-up:
  docker compose up --build mcp

logs-mcp:
  docker compose logs -f mcp

smoke:
  node scripts/dev/smoke.mjs

smoke-ai:
  just db-up
  just migrate
  SEED_WITH_EMBEDDINGS=true pnpm --filter @dovetail/db db:seed
  SMOKE_AI=1 node scripts/dev/smoke.mjs
