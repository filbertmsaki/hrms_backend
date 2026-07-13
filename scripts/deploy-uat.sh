#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

APP_DIR="${APP_DIR:-/opt/apps/hrms/uat/backend}" \
API_PM2_NAME="${API_PM2_NAME:-hrms-uat-api}" \
WEB_PM2_NAME="${WEB_PM2_NAME:-hrms-uat-web}" \
APP_PORT="${APP_PORT:-9999}" \
"$SCRIPT_DIR/deploy-production.sh" "$@"
