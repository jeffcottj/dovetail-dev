FROM node:20-alpine AS builder
WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY tsconfig.base.json ./
COPY packages/types/package.json ./packages/types/
COPY packages/db/package.json ./packages/db/
COPY apps/web/package.json ./apps/web/

RUN pnpm install --frozen-lockfile

COPY packages/types/ ./packages/types/
COPY packages/db/ ./packages/db/
COPY apps/web/ ./apps/web/

# Re-link binaries after source copy (BuildKit COPY replaces directory contents)
RUN pnpm install --frozen-lockfile

RUN pnpm --filter @dovetail/types build
RUN pnpm --filter @dovetail/db build

# Next.js expects .env to exist at build time (stat check);
# DATABASE_URL needed because @dovetail/db validates at import time during page collection
RUN touch apps/web/.env
RUN mkdir -p apps/web/public
ENV DATABASE_URL=postgres://build:build@localhost:5432/build

# next.config.ts evaluates API_URL at build time for the /api/:path* rewrite,
# so it must be set before `next build`. Default targets the compose API service.
ARG API_URL=http://api:3001
ENV API_URL=$API_URL

RUN pnpm --filter @dovetail/web build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0

COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public

EXPOSE 3000

CMD ["node", "apps/web/server.js"]
