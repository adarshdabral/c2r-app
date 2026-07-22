#!/usr/bin/env bash
#
# Server-side deploy step, invoked by the CD job (or manually on the box) AFTER
# the working tree has been updated to the target commit. Idempotent: installs
# deps, rebuilds the frontend, and (re)starts both apps under pm2.
#
# Usage (on the server):  bash scripts/deploy.sh
#
set -euo pipefail

# Repo root = parent of this script's directory.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
echo "▶ Deploying $(git rev-parse --short HEAD) — $(git log -1 --pretty=%s)"

# ---- Backend ----------------------------------------------------------------
echo "▶ Backend: install"
cd "$ROOT/backend"
npm ci --omit=dev --no-audit --no-fund
echo "▶ Backend: (re)start"
pm2 restart backend --update-env || pm2 start server.js --name backend

# ---- Frontend ---------------------------------------------------------------
echo "▶ Frontend: install + build"
cd "$ROOT/frontend"
npm ci --no-audit --no-fund
# Heap capped for the 1.9GB instance (+ swap); .env.production supplies
# NEXT_PUBLIC_API_URL at build time.
NODE_OPTIONS=--max-old-space-size=1536 npm run build
echo "▶ Frontend: (re)start"
pm2 restart frontend --update-env || pm2 start npm --name frontend -- start

# ---- Persist pm2 process list ----------------------------------------------
pm2 save
echo "✅ Deploy complete"
