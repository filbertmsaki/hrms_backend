#!/usr/bin/env bash
set -Eeuo pipefail

DEPLOY_SHA="${1:-}"

if [[ -z "$DEPLOY_SHA" ]]; then
  echo "Usage: $0 <commit-sha>"
  exit 1
fi

# -------------------------------------------------------------------
# Environment configuration
# -------------------------------------------------------------------
APP_DIR="${APP_DIR:-/opt/apps/hrms/prod/backend}"
ECOSYSTEM_FILE="${ECOSYSTEM_FILE:-/opt/apps/hrms/ecosystem.config.js}"
BRANCH="${BRANCH:-main}"

API_PM2_NAME="${API_PM2_NAME:-hrms-prod-api}"
WEB_PM2_NAME="${WEB_PM2_NAME:-hrms-prod-web}"
APP_PORT="${APP_PORT:-8888}"
HEALTHCHECK_PATH="${HEALTHCHECK_PATH:-/api}"

PREVIOUS_SHA_FILE="${PREVIOUS_SHA_FILE:-$APP_DIR/.previous-deploy-sha}"

# -------------------------------------------------------------------
# Helper functions
# -------------------------------------------------------------------
log() {
  printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"
}

fail() {
  log "ERROR: $*"
  exit 1
}

show_failure_details() {
  local exit_code=$?

  set +e

  log "Deployment failed with exit code: $exit_code"

  if [[ -f "$PREVIOUS_SHA_FILE" ]]; then
    log "Previous deployed commit: $(cat "$PREVIOUS_SHA_FILE")"
  fi

  log "Showing recent PM2 logs for $API_PM2_NAME..."
  sudo -n pm2 logs "$API_PM2_NAME" --lines 80 --nostream || true

  exit "$exit_code"
}

trap show_failure_details ERR

# -------------------------------------------------------------------
# Validate required commands and paths
# -------------------------------------------------------------------
for command_name in git node npm curl sudo; do
  command -v "$command_name" >/dev/null 2>&1 \
    || fail "Required command is not installed: $command_name"
done

[[ -d "$APP_DIR" ]] || fail "Application directory does not exist: $APP_DIR"
[[ -d "$APP_DIR/.git" ]] || fail "Application directory is not a Git repository: $APP_DIR"
[[ -f "$ECOSYSTEM_FILE" ]] || fail "PM2 ecosystem file does not exist: $ECOSYSTEM_FILE"
[[ -w "$APP_DIR" ]] || fail "Runner user cannot write to application directory: $APP_DIR"
[[ -w "$APP_DIR/.git" ]] || fail "Runner user cannot write to Git metadata: $APP_DIR/.git"

if [[ -d "$APP_DIR/uploads" ]]; then
  NON_WRITABLE_UPLOAD_DIR="$(
    find "$APP_DIR/uploads" -maxdepth 3 -type d ! -writable -print -quit 2>/dev/null || true
  )"

  if [[ -n "$NON_WRITABLE_UPLOAD_DIR" ]]; then
    fail "Runner user cannot write to upload directory: $NON_WRITABLE_UPLOAD_DIR. Correct its owner/permissions before deploying."
  fi
fi

log "======================================"
log "HRMS Deployment Started"
log "======================================"
log "Environment branch: $BRANCH"
log "Target directory: $APP_DIR"
log "Target commit: $DEPLOY_SHA"
log "Runner user: $(whoami)"
log "Runner host: $(hostname)"

cd "$APP_DIR"

# -------------------------------------------------------------------
# Fetch and validate the requested commit
# -------------------------------------------------------------------
log "Fetching origin/$BRANCH..."
git fetch --prune origin "$BRANCH"

git cat-file -e "${DEPLOY_SHA}^{commit}" 2>/dev/null \
  || fail "Commit $DEPLOY_SHA is not available after fetching origin/$BRANCH."

git merge-base --is-ancestor "$DEPLOY_SHA" "origin/$BRANCH" \
  || fail "Commit $DEPLOY_SHA is not part of origin/$BRANCH."

CURRENT_SHA="$(git rev-parse HEAD)"
log "Current deployed commit: $CURRENT_SHA"

printf '%s\n' "$CURRENT_SHA" > "$PREVIOUS_SHA_FILE"

# -------------------------------------------------------------------
# Checkout and build the exact approved commit
# -------------------------------------------------------------------
log "Checking out commit $DEPLOY_SHA..."
git checkout --force "$DEPLOY_SHA"

ACTUAL_SHA="$(git rev-parse HEAD)"

[[ "$ACTUAL_SHA" == "$DEPLOY_SHA" ]] \
  || fail "Checked-out SHA $ACTUAL_SHA does not match requested SHA $DEPLOY_SHA."

log "Node version: $(node -v)"
log "npm version: $(npm -v)"

log "Installing dependencies..."
npm ci --no-audit --no-fund

log "Building NestJS backend..."
npm run build

[[ -f "$APP_DIR/dist/main.js" ]] \
  || fail "Build completed but dist/main.js was not created."

# -------------------------------------------------------------------
# Database and application restart
# -------------------------------------------------------------------
log "Running TypeORM migrations..."
npm run migration:run

log "Reloading PM2 backend: $API_PM2_NAME"
sudo -n pm2 reload "$ECOSYSTEM_FILE" \
  --only "$API_PM2_NAME" \
  --update-env

if [[ -n "$WEB_PM2_NAME" ]]; then
  log "Reloading PM2 web process: $WEB_PM2_NAME"
  sudo -n pm2 reload "$ECOSYSTEM_FILE" \
    --only "$WEB_PM2_NAME" \
    --update-env
fi

log "Saving PM2 process list..."
sudo -n pm2 save

# -------------------------------------------------------------------
# Health check
# -------------------------------------------------------------------
HEALTHCHECK_URL="http://127.0.0.1:${APP_PORT}${HEALTHCHECK_PATH}"
HTTP_CODE="000"

log "Checking application health: $HEALTHCHECK_URL"

for attempt in {1..30}; do
  HTTP_CODE="$(
    curl \
      --silent \
      --show-error \
      --output /dev/null \
      --write-out "%{http_code}" \
      "$HEALTHCHECK_URL" \
      || true
  )"

  # Accept 2xx, 3xx, and 4xx responses as evidence that the API process
  # is running. Replace this with an exact 200 check when a dedicated
  # public health endpoint is available.
  if [[ "$HTTP_CODE" =~ ^(2|3|4) ]]; then
    log "Application is responding. HTTP status: $HTTP_CODE"
    break
  fi

  log "Waiting for application startup: attempt $attempt/30, status=$HTTP_CODE"
  sleep 2
done

[[ "$HTTP_CODE" =~ ^(2|3|4) ]] \
  || fail "Application health check failed. Last HTTP status: $HTTP_CODE"

trap - ERR

log "Deployment succeeded at commit $DEPLOY_SHA"
log "======================================"
log "HRMS Deployment Completed"
log "======================================"