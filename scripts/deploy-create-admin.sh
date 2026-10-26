#!/usr/bin/env bash
set -euo pipefail

# Creates (or promotes) an admin in the PRODUCTION database (via SSH tunnel to prod postgres).
# Set ADMIN_PASSWORD to choose the password (it also resets an existing account's).
# usage: [ADMIN_PASSWORD=...] bun run deploy:create-admin <email> <username> [name] [--master]
REMOTE="root@oc"
REMOTE_DIR="/root/finance-tracker/server"
TUNNEL_PORT=15434

[ $# -ge 2 ] || { echo "usage: $0 <email> <username> [name]"; exit 1; }

cd "$(dirname "${BASH_SOURCE[0]:-$0}")/.."

PROD_DB_URL="$(ssh "$REMOTE" "set -a && . $REMOTE_DIR/.env && set +a && printf %s \"\$DATABASE_URL\"" | sed "s#@localhost:5432/#@127.0.0.1:$TUNNEL_PORT/#")"
# Reuse a tunnel that's already open on the port; only close one we opened.
TUNNEL_PID=""
if ! nc -z 127.0.0.1 "$TUNNEL_PORT" 2>/dev/null; then
  ssh -f -N -o ExitOnForwardFailure=yes -L "$TUNNEL_PORT:127.0.0.1:5432" "$REMOTE"
  TUNNEL_PID="$(pgrep -f "ssh -f -N .*-L $TUNNEL_PORT:127.0.0.1:5432" | head -1)"
fi
trap '[ -n "$TUNNEL_PID" ] && kill "$TUNNEL_PID" 2>/dev/null || true' EXIT
(cd apps/api && DATABASE_URL="$PROD_DB_URL" bun run db:create-admin "$@")
