FROM node:20-alpine AS builder
WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY tsconfig.base.json ./
COPY packages/types/package.json ./packages/types/
COPY apps/mcp/package.json ./apps/mcp/

RUN pnpm install --frozen-lockfile --filter @dovetail/mcp...

COPY packages/types/ ./packages/types/
COPY apps/mcp/ ./apps/mcp/

RUN pnpm install --frozen-lockfile --filter @dovetail/mcp...

RUN pnpm --filter @dovetail/types build
RUN pnpm --filter @dovetail/mcp build

FROM node:20-alpine AS runner
WORKDIR /app
RUN corepack enable

COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-lock.yaml ./
COPY --from=builder /app/pnpm-workspace.yaml ./

COPY --from=builder /app/packages/types/package.json ./packages/types/
COPY --from=builder /app/packages/types/dist ./packages/types/dist

COPY --from=builder /app/apps/mcp/package.json ./apps/mcp/
COPY --from=builder /app/apps/mcp/dist ./apps/mcp/dist

RUN pnpm install --prod --frozen-lockfile --filter @dovetail/mcp...

ENV NODE_ENV=production

EXPOSE 3002

CMD ["node", "apps/mcp/dist/index.js"]
