# ── Stage 1: Build ─────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /repo

COPY package.json package-lock.json ./
COPY packages/types/package.json packages/types/package.json
COPY frontend/package.json frontend/package.json
COPY backend/package.json backend/package.json
RUN npm ci

COPY packages/ packages/
COPY frontend/ frontend/

WORKDIR /repo/frontend
RUN npm run build

# ── Stage 2: nginx static server ────────────────────────────────────────────
FROM nginx:1.27-alpine AS runner
COPY --from=builder /repo/frontend/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
