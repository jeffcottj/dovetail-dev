FROM node:22-alpine AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.33.3 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY tsconfig.base.json ./
COPY packages/types/package.json ./packages/types/
COPY packages/db/package.json ./packages/db/
COPY apps/api/package.json ./apps/api/

RUN pnpm install --frozen-lockfile

COPY packages/types/ ./packages/types/
COPY packages/db/ ./packages/db/
COPY apps/api/ ./apps/api/

# Re-link binaries after source copy (BuildKit COPY replaces directory contents)
RUN pnpm install --frozen-lockfile

RUN pnpm --filter @dovetail/types build
RUN pnpm --filter @dovetail/db build
RUN pnpm --filter @dovetail/api build

FROM node:22-alpine AS runner
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.33.3 --activate

COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-lock.yaml ./
COPY --from=builder /app/pnpm-workspace.yaml ./

COPY --from=builder /app/packages/types/package.json ./packages/types/
COPY --from=builder /app/packages/types/dist ./packages/types/dist

COPY --from=builder /app/packages/db/package.json ./packages/db/
COPY --from=builder /app/packages/db/dist ./packages/db/dist
COPY --from=builder /app/packages/db/migrations ./packages/db/migrations

COPY --from=builder /app/apps/api/package.json ./apps/api/
COPY --from=builder /app/apps/api/dist ./apps/api/dist

RUN pnpm install --prod --frozen-lockfile

ENV NODE_ENV=production

EXPOSE 3001

CMD ["sh", "-c", "node packages/db/dist/migrate.js && node apps/api/dist/index.js"]
