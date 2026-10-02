#!/usr/bin/env bash

# Server Daemon Script with Auto-Restart
# Runs the server in a loop and automatically restarts on crashes

# tmux starts this as a non-interactive shell, so ~/.bashrc's early
# "not interactive, don't do anything" guard skips the bun PATH export.
export BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"
export PATH="$BUN_INSTALL/bin:$PATH"

SERVER_FILE="server.js"
LOG_FILE="/root/finance-tracker/server/server.log"
PID_FILE="/root/finance-tracker/server/server.pid"
MAX_RESTART_DELAY=60
MIN_UPTIME=10

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() {
    echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
}

error() {
    echo -e "${RED}[$(date '+%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1" | tee -a "$LOG_FILE"
}

warn() {
    echo -e "${YELLOW}[$(date '+%Y-%m-%d %H:%M:%S')] WARN:${NC} $1" | tee -a "$LOG_FILE"
}

# Load .env from same directory
if [ -f ".env" ]; then
    set -a
    # shellcheck disable=SC1091
    source .env
    set +a
fi

export NODE_ENV=production
PORT="${PORT:-4300}"

check_port() {
    if lsof -Pi :"$PORT" -sTCP:LISTEN -t >/dev/null 2>&1; then
        local pid
        pid=$(lsof -Pi :"$PORT" -sTCP:LISTEN -t)
        warn "Port $PORT already in use by PID $pid — killing..."
        kill -15 "$pid" 2>/dev/null || kill -9 "$pid" 2>/dev/null
        sleep 2
        if lsof -Pi :"$PORT" -sTCP:LISTEN -t >/dev/null 2>&1; then
            error "Failed to free port $PORT. Exiting."
            return 1
        fi
        log "Port $PORT freed"
    fi
    return 0
}

cleanup() {
    log "Shutting down server daemon..."
    if [ -f "$PID_FILE" ]; then
        local pid
        pid=$(cat "$PID_FILE")
        if kill -0 "$pid" 2>/dev/null; then
            kill -15 "$pid" 2>/dev/null
            sleep 2
            kill -9 "$pid" 2>/dev/null || true
        fi
        rm -f "$PID_FILE"
    fi
    exit 0
}

trap cleanup SIGTERM SIGINT

if [ ! -f "$SERVER_FILE" ]; then
    error "Server file $SERVER_FILE not found!"
    exit 1
fi

log "Starting server daemon (PORT: $PORT)"
log "Log file: $LOG_FILE"

restart_count=0
consecutive_crashes=0

while true; do
    if ! check_port; then
        error "Cannot start — port check failed"
        sleep 5
        continue
    fi

    start_time=$(date +%s)
    restart_count=$((restart_count + 1))
    log "Starting server (attempt #$restart_count)..."

    bun run "$SERVER_FILE" >> "$LOG_FILE" 2>&1 &
    server_pid=$!
    echo "$server_pid" > "$PID_FILE"
    log "Server started with PID: $server_pid"

    wait "$server_pid"
    exit_code=$?
    end_time=$(date +%s)
    uptime=$((end_time - start_time))
    rm -f "$PID_FILE"

    if [ "$uptime" -lt "$MIN_UPTIME" ]; then
        consecutive_crashes=$((consecutive_crashes + 1))
        error "Server crashed after ${uptime}s (exit code: $exit_code) — crash #$consecutive_crashes"

        if [ "$consecutive_crashes" -ge 5 ]; then
            delay=$MAX_RESTART_DELAY
            error "Too many crashes! Waiting ${delay}s..."
        else
            delay=$((consecutive_crashes * 5))
            warn "Waiting ${delay}s before restart..."
        fi
    else
        consecutive_crashes=0
        delay=2
        log "Server stopped after ${uptime}s (exit code: $exit_code) — restarting in ${delay}s..."
    fi

    sleep "$delay"
done
