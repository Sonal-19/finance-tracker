#!/usr/bin/env bash
set -euo pipefail

# Sets a user's role in the PRODUCTION database (via SSH tunnel to prod postgres).
# usage: bun run deploy:make-admin <email> [user|admin]
REMOTE="root@oc"
REMOTE_DIR="/root/finance-tracker/server"
TUNNEL_PORT=15434

[ $# -ge 1 ] || { echo "usage: $0 <email> [user|admin]"; exit 1; }

cd "$(dirname "${BASH_SOURCE[0]:-$0}")/.."

PROD_DB_URL="$(ssh "$REMOTE" "set -a && . $REMOTE_DIR/.env && set +a && printf %s \"\$DATABASE_URL\"" | sed "s#@localhost:5432/#@127.0.0.1:$TUNNEL_PORT/#")"
ssh -f -N -o ExitOnForwardFailure=yes -L "$TUNNEL_PORT:127.0.0.1:5432" "$REMOTE"
TUNNEL_PID="$(pgrep -f "ssh -f -N .*-L $TUNNEL_PORT:127.0.0.1:5432" | head -1)"
trap 'kill "$TUNNEL_PID" 2>/dev/null || true' EXIT
(cd apps/api && DATABASE_URL="$PROD_DB_URL" bun run db:make-admin "$@")
