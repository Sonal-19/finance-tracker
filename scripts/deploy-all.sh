#!/usr/bin/env bash
set -euo pipefail
D="$(dirname "${BASH_SOURCE[0]:-$0}")"
case "${1:-all}" in
  backend)  zsh "$D/deploy-backend.sh" ;;
  frontend) zsh "$D/deploy-frontend.sh" ;;
  all)      zsh "$D/deploy-backend.sh"; zsh "$D/deploy-frontend.sh" ;;
  *) echo "usage: $0 [all|backend|frontend]"; exit 1 ;;
esac
