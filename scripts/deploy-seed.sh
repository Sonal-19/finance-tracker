#!/usr/bin/env bash
set -euo pipefail

# Seeds the PRODUCTION database with demo data. This TRUNCATES all tables, so it asks first.
REMOTE="root@oc"
REMOTE_DIR="/root/finance-tracker/server"
TUNNEL_PORT=15434

cd "$(dirname "${BASH_SOURCE[0]:-$0}")/.."

printf "This WIPES all data in the prod finance_tracker DB. Type 'wipe' to continue: "
read -r ans
[ "$ans" = "wipe" ] || { echo "aborted"; exit 1; }

ssh "$REMOTE" "set -a && . $REMOTE_DIR/.env && set +a && pg_dump -Fc \"\${DATABASE_URL%%\?*}\" -f /root/backups/finance-tracker-preseed-\$(date +%Y%m%d-%H%M%S).dump"
PROD_DB_URL="$(ssh "$REMOTE" "set -a && . $REMOTE_DIR/.env && set +a && printf %s \"\$DATABASE_URL\"" | sed "s#@localhost:5432/#@127.0.0.1:$TUNNEL_PORT/#")"
ssh -f -N -o ExitOnForwardFailure=yes -L "$TUNNEL_PORT:127.0.0.1:5432" "$REMOTE"
TUNNEL_PID="$(pgrep -f "ssh -f -N .*-L $TUNNEL_PORT:127.0.0.1:5432" | head -1)"
trap 'kill "$TUNNEL_PID" 2>/dev/null || true' EXIT
(cd apps/api && DATABASE_URL="$PROD_DB_URL" FORCE_SEED=true bun run db:seed)
