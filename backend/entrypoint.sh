#!/bin/sh
set -e

echo "[entrypoint] Running database migrations..."
./node_modules/.bin/prisma migrate deploy

echo "[entrypoint] Starting server..."
exec node dist/index.js
