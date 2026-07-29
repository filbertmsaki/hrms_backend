#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Reuse the validated deployment engine with UAT-specific configuration.
APP_DIR="${APP_DIR:-/opt/apps/hrms/uat/backend}" \
ECOSYSTEM_FILE="${ECOSYSTEM_FILE:-/opt/apps/hrms/ecosystem.config.js}" \
BRANCH="${BRANCH:-uat}" \
API_PM2_NAME="${API_PM2_NAME:-hrms-uat-api}" \
WEB_PM2_NAME="${WEB_PM2_NAME:-hrms-uat-web}" \
APP_PORT="${APP_PORT:-9999}" \
HEALTHCHECK_PATH="${HEALTHCHECK_PATH:-/api}" \
PREVIOUS_SHA_FILE="${PREVIOUS_SHA_FILE:-/opt/apps/hrms/uat/backend/.previous-deploy-sha}" \
"$SCRIPT_DIR/deploy-production.sh" "$@"