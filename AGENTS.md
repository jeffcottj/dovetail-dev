# AGENTS.md

## Project Overview

- Dovetail is a TypeScript monorepo for a legal knowledge base.
- The full Docker stack has three services: `postgres`, `api`, and `web`.
- The default local debugging workflow is hybrid: run `postgres` in Docker and run the app processes locally with watch mode.
- The frontend lives in `apps/web` and uses Next.js 15 App Router with React 19.
- The backend lives in `apps/api` and uses Express 5.
- The ORM and schema layer lives in `packages/db` and uses Drizzle.
- Shared types live in `packages/types`.
- Local development expects Node 20+, pnpm 9+, and `just`.

## Working Priorities

- Prefer local debugging over deployed debugging. Reproduce and inspect issues in the local repo first.
- Treat Docker as the environment boundary for the full stack, but prefer the lightest local setup that reproduces the issue.
- Keep fixes narrow. Avoid broad refactors unless the bug clearly requires them.
- Check existing patterns in the touched app or package before introducing new ones.

## Bug Fix Workflow

- Every bug fix must start with a concrete reproduction recipe.
- The reproduction recipe should include the exact commands, URLs, seed data, request payloads, or user actions needed to observe the bug.
- If the bug is not reproducible yet, your first job is to tighten the repro or identify the missing setup.
- After implementing a fix, rerun the reproduction recipe and confirm the original failure no longer occurs.
- After the repro passes, run the smallest relevant validation checks for the code you changed.
- Prefer targeted checks such as a single package test file, a focused test command, lint on the affected package, or a local request against the changed endpoint. Do not jump straight to full-repo checks unless the scope justifies it.

## Repo Guidance

- For local development, prefer starting only what is needed. The common fast path is `just setup` once, then `just dev` for day-to-day work.
- `just dev` starts `postgres` in Docker, reapplies migrations, reseeds the database, and runs the workspace `dev` processes with watch mode.
- Use `just doctor` to verify local prerequisites and `just db-reset` to return Postgres to a known-good seeded state.
- Use `just smoke` for a repeatable read-only local smoke test after changes. Use `just smoke-ai` only when the change depends on embeddings or RAG behavior.
- Web usually runs on `http://localhost:3000` and API on `http://localhost:3001` in local development.
- Local debugging usually does not require external OAuth setup. `.env.example` enables `DEV_AUTH_ENABLED=true`, and `/login` exposes seeded `Local Admin`, `Local Editor`, and `Local Viewer` identities.
- Database changes should be handled through the Drizzle workflow already used in `packages/db`.
- When you need container-level behavior rather than the faster hybrid loop, use `just stack` or `just stack-logs`.
- When debugging cross-service issues, verify whether the failure is in `web`, `api`, database access, or service-to-service configuration before editing code.

## Expectations For Codex

- Start by locating the relevant code path and writing down the repro steps.
- Make the minimal code change that resolves the verified cause.
- Rerun the repro after the change.
- Run the smallest relevant checks after the repro passes.
- In the final handoff, report the repro you used, the fix you made, the checks you ran, and any remaining risk or follow-up if verification was partial.
