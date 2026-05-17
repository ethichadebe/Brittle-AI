# ── Stage 1: Build ─────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /repo

# Install all workspace dependencies
COPY package.json package-lock.json ./
COPY packages/types/package.json packages/types/package.json
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN npm ci

# Copy source and compile
COPY packages/ packages/
COPY backend/ backend/
WORKDIR /repo/backend
RUN npx prisma generate && npx tsc

# ── Stage 2: Production runner ──────────────────────────────────────────────
# node:22-slim (Debian) is required — Playwright's Chromium binary targets glibc
FROM node:22-slim AS runner
WORKDIR /app

# Copy workspace node_modules (includes prisma CLI, playwright, fastify, etc.)
# All @accucery/types imports in the backend are `import type` — erased at
# compile time — so the dangling workspace symlink causes no runtime errors.
COPY --from=builder /repo/node_modules ./node_modules
COPY --from=builder /repo/backend/dist ./dist
COPY --from=builder /repo/backend/prisma ./prisma

# Install Playwright Chromium + required OS libraries in one step
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN ./node_modules/.bin/playwright install --with-deps chromium

ENV NODE_ENV=production
EXPOSE 3000

COPY backend/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
