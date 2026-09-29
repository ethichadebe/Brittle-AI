# ── Stage 1: Build ─────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /repo

# Install all workspace dependencies
COPY package.json package-lock.json ./
COPY packages/types/package.json packages/types/package.json
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN npm ci

# Copy source and compile. packages/types is built too — a backend route
# that imports a real value from it (not just `import type`, erased by tsc)
# needs actual JS to run against in the stage below, not just types.
COPY packages/ packages/
COPY backend/ backend/
RUN npm run build -w packages/types
WORKDIR /repo/backend
RUN npx prisma generate && npx tsc

# ── Stage 2: Production runner ──────────────────────────────────────────────
# node:22-slim (Debian) is required — Playwright's Chromium binary targets glibc
FROM node:22-slim AS runner
WORKDIR /app

# Copy workspace node_modules (includes prisma CLI, playwright, fastify, etc.).
# node_modules/@accucery/types is an npm workspace symlink pointing outside
# this stage's filesystem (../../packages/types, never copied in), so it
# dangles. Every import of it used to be `import type` and got erased by
# tsc, so the dangling link cost nothing at runtime — until a route needed
# an actual value (STORE_CONFIGS). Replaced here with the package's real
# compiled output and a minimal package.json of its own, so `import` resolves.
COPY --from=builder /repo/node_modules ./node_modules
RUN rm -rf ./node_modules/@accucery/types && \
    mkdir -p ./node_modules/@accucery/types && \
    printf '{"name":"@accucery/types","private":true,"type":"module","main":"./dist/index.js"}' \
      > ./node_modules/@accucery/types/package.json
COPY --from=builder /repo/packages/types/dist ./node_modules/@accucery/types/dist
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
