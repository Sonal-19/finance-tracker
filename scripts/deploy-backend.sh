#!/usr/bin/env bash
set -euo pipefail

# ====== CONFIG ======
REMOTE="root@oc"
REMOTE_DIR="/root/finance-tracker/server"
SESSION="finance-tracker-api"
PORT="4300"
TUNNEL_PORT=15434

log() { echo -e "\033[0;32m$1\033[0m"; }
err() { echo -e "\033[0;31m$1\033[0m"; }

cd "$(dirname "${BASH_SOURCE[0]:-$0}")/.."

log "📦 Building server..."
(cd apps/api && bun run build)
[ -f apps/api/server.js ] || { err "❌ Build failed! server.js not found."; exit 1; }

# ====== DATABASE: backup, then push schema (via SSH tunnel to prod postgres) ======
# Never seeds: `db:seed` truncates every table. Use `bun run deploy:seed` once for demo data.
log "🗄️  Backing up prod database..."
ssh "$REMOTE" "mkdir -p /root/backups && set -a && . $REMOTE_DIR/.env && set +a && pg_dump -Fc \"\${DATABASE_URL%%\?*}\" -f /root/backups/finance-tracker-\$(date +%Y%m%d-%H%M%S).dump"

log "🗄️  Opening tunnel and syncing schema..."
PROD_DB_URL="$(ssh "$REMOTE" "set -a && . $REMOTE_DIR/.env && set +a && printf %s \"\$DATABASE_URL\"" | sed "s#@localhost:5432/#@127.0.0.1:$TUNNEL_PORT/#")"
ssh -f -N -o ExitOnForwardFailure=yes -L "$TUNNEL_PORT:127.0.0.1:5432" "$REMOTE"
TUNNEL_PID="$(pgrep -f "ssh -f -N .*-L $TUNNEL_PORT:127.0.0.1:5432" | head -1)"
trap 'kill "$TUNNEL_PID" 2>/dev/null || true' EXIT
(cd apps/api && DATABASE_URL="$PROD_DB_URL" bun run db:push)
kill "$TUNNEL_PID" 2>/dev/null || true
log "✅ Database schema up to date"

log "📤 Copying files to $REMOTE..."
ssh "$REMOTE" "mkdir -p $REMOTE_DIR/logs"
scp apps/api/server.js scripts/run-server-daemon.sh "$REMOTE:$REMOTE_DIR/"

log "🔄 Restarting server..."
ssh "$REMOTE" bash <<REMOTE_EOF
  set -e
  tmux kill-session -t "$SESSION" 2>/dev/null || true
  chmod +x "$REMOTE_DIR/run-server-daemon.sh"
  cd "$REMOTE_DIR"
  tmux new-session -d -s "$SESSION" "./run-server-daemon.sh"
  sleep 3
  tmux has-session -t "$SESSION" && echo "✅ tmux session '$SESSION' running"
  curl -fsS http://127.0.0.1:$PORT/health && echo
REMOTE_EOF

log "✅ Backend deployed: https://tracker.com.u4.lol/api/"
echo "  Logs:   ssh $REMOTE 'tail -f $REMOTE_DIR/server.log'"
echo "  Attach: ssh $REMOTE -t 'tmux attach -t $SESSION'"
