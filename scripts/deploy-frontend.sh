#!/usr/bin/env bash
set -euo pipefail

# ====== CONFIG ======
REMOTE="root@oc"
REMOTE_FINAL="/var/www/finance-tracker/front-end/"
BUILD_DIR="apps/web/dist"

log() { echo -e "\033[0;32m$1\033[0m"; }

cd "$(dirname "${BASH_SOURCE[0]:-$0}")/.."

log "🔨 Building frontend..."
rm -rf "$BUILD_DIR"
(cd apps/web && bun run build)
[ -d "$BUILD_DIR" ] || { echo "❌ Build failed! dist/ not found."; exit 1; }

ssh "$REMOTE" "mkdir -p $REMOTE_FINAL"

# Hashed assets first, WITHOUT --delete, so already-open tabs keep working
log "📂 Step 1/2: Syncing hashed assets..."
[ -d "$BUILD_DIR/assets" ] && rsync -av --exclude=".DS_Store" "$BUILD_DIR/assets/" "$REMOTE:${REMOTE_FINAL}assets/"

# Then swap in index.html and the rest
log "📄 Step 2/2: Syncing root files..."
rsync -av --delete --exclude="assets/" --exclude=".DS_Store" "$BUILD_DIR/" "$REMOTE:$REMOTE_FINAL"

log "✅ Frontend deployed: https://tracker.com.u4.lol"
