FROM node:20-slim AS base

RUN apt-get update -y && apt-get install -y \
  openssl libssl-dev \
  && rm -rf /var/lib/apt/lists/*

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10.30.3 --activate

# --- Dependencies stage ---
FROM base AS deps

WORKDIR /app

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml turbo.json ./
COPY apps/web/package.json apps/web/
COPY apps/server/package.json apps/server/
COPY packages/api/package.json packages/api/
COPY packages/auth/package.json packages/auth/
COPY packages/config/package.json packages/config/
COPY packages/db/package.json packages/db/
COPY packages/env/package.json packages/env/
COPY packages/ui/package.json packages/ui/

# Prisma schema + config must be present before install (postinstall runs prisma generate)
COPY packages/db/prisma.config.ts packages/db/
COPY packages/db/prisma packages/db/prisma

RUN pnpm install --frozen-lockfile

# --- Builder stage ---
FROM base AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=deps /app/apps/server/node_modules ./apps/server/node_modules
COPY --from=deps /app/packages/api/node_modules ./packages/api/node_modules
COPY --from=deps /app/packages/auth/node_modules ./packages/auth/node_modules
COPY --from=deps /app/packages/db/node_modules ./packages/db/node_modules
COPY --from=deps /app/packages/env/node_modules ./packages/env/node_modules
COPY --from=deps /app/packages/ui/node_modules ./packages/ui/node_modules

COPY . .

RUN pnpm build

# Verify build outputs exist
RUN test -f apps/server/dist/index.mjs && test -d apps/web/dist

# --- Production deps stage ---
FROM base AS prod-deps

WORKDIR /app

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/api/package.json packages/api/
COPY packages/auth/package.json packages/auth/
COPY packages/config/package.json packages/config/
COPY packages/db/package.json packages/db/
COPY packages/env/package.json packages/env/
COPY packages/ui/package.json packages/ui/

# Prisma schema + config needed for postinstall
COPY packages/db/prisma.config.ts packages/db/
COPY packages/db/prisma packages/db/prisma

RUN pnpm install --frozen-lockfile --prod --ignore-scripts

# --- Runner stage ---
FROM base AS runner

ENV NODE_ENV=production
WORKDIR /app

# Copy workspace config (needed for pnpm --filter at runtime)
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/db/package.json packages/db/

# Copy production node_modules
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/apps/server/node_modules ./apps/server/node_modules
COPY --from=prod-deps /app/packages/db/node_modules ./packages/db/node_modules

# Copy generated Prisma client from builder (since prod-deps skips postinstall)
COPY --from=builder /app/packages/db/generated ./packages/db/generated

# Copy Prisma schema + config for runtime db push
COPY --from=builder /app/packages/db/prisma ./packages/db/prisma
COPY --from=builder /app/packages/db/prisma.config.ts ./packages/db/prisma.config.ts

# Copy built server and web SPA
COPY --from=builder /app/apps/server/dist ./apps/server/dist
COPY --from=builder /app/apps/web/dist ./apps/web/dist

EXPOSE 3000

WORKDIR /app/apps/server
CMD ["sh", "-c", "[ \"$APPLY_SCHEMA\" = \"true\" ] && cd /app && pnpm --filter @myagents/db db:push; cd /app/apps/server && node dist/index.mjs"]
