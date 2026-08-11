#!/usr/bin/env bash

set -Eeuo pipefail

# ============================================================
# HRMS BACKEND RELEASE DEPLOYMENT
# ============================================================

RELEASE_ID="${1:?usage: deploy.sh <release-id>}"

BASE_DIR="${BASE_DIR:?Set BASE_DIR}"
PM2_APP_NAME="${PM2_APP_NAME:?Set PM2_APP_NAME}"
APP_ENV="${APP_ENV:?Set APP_ENV}"
APP_PORT="${APP_PORT:?Set APP_PORT}"
HEALTH_URL="${HEALTH_URL:?Set HEALTH_URL}"

KEEP_RELEASES="${KEEP_RELEASES:-3}"

RELEASES_DIR="$BASE_DIR/releases"
RELEASE_DIR="$RELEASES_DIR/$RELEASE_ID"

SHARED_DIR="$BASE_DIR/shared"
CURRENT_LINK="$BASE_DIR/current"

DEPLOY_LOCK_FILE="${DEPLOY_LOCK_FILE:-$SHARED_DIR/deploy.lock}"

PREVIOUS_RELEASE="$(
  readlink -f "$CURRENT_LINK" 2>/dev/null || true
)"

CURRENT_SWITCHED=0


# ============================================================
# LOGGING
# ============================================================

log() {
  printf '[%s] %s\n' "$(date '+%F %T')" "$*"
}


# ============================================================
# SHOW PM2 LOGS
# ============================================================

show_logs() {
  pm2 logs "$PM2_APP_NAME" \
    --lines 120 \
    --nostream || true
}


# ============================================================
# ROLLBACK
# ============================================================

rollback() {
  if [[ "$CURRENT_SWITCHED" != "1" ]]; then
    log "Current release was not switched."
    log "Application rollback is not required."
    return
  fi

  if [[ -n "$PREVIOUS_RELEASE" && -d "$PREVIOUS_RELEASE" ]]; then
    log "Rolling back to previous release:"
    log "$PREVIOUS_RELEASE"

    ln -sfn \
      "$PREVIOUS_RELEASE" \
      "$CURRENT_LINK"

    export BASE_DIR
    export PM2_APP_NAME
    export APP_ENV
    export APP_PORT

    pm2 startOrReload \
      "$SHARED_DIR/ecosystem.config.js" \
      --only "$PM2_APP_NAME" \
      --update-env || true

    pm2 save || true

    log "Application rollback completed."
  else
    log "No previous HRMS release exists for rollback."
  fi
}


# ============================================================
# ERROR HANDLER
# ============================================================

on_error() {
  local status=$?
  local line_number="${1:-unknown}"

  log "Deployment failed."
  log "Line: $line_number"
  log "Exit status: $status"

  show_logs
  rollback

  exit "$status"
}

trap 'on_error $LINENO' ERR


# ============================================================
# VALIDATE RELEASE ID
# ============================================================

if [[ ! "$RELEASE_ID" =~ ^[0-9a-fA-F]{40}$ ]]; then
  log "Invalid release ID."
  log "Expected full 40-character Git SHA."
  exit 1
fi


# ============================================================
# REQUIRED COMMANDS
# ============================================================

required_commands=(
  node
  npm
  pm2
  curl
  flock
)

for command in "${required_commands[@]}"; do
  command -v "$command" >/dev/null || {
    log "Required command is not installed: $command"
    exit 1
  }
done


# ============================================================
# DIRECTORIES
# ============================================================

mkdir -p \
  "$RELEASES_DIR" \
  "$SHARED_DIR" \
  "$SHARED_DIR/logs"

if [[ -e "$CURRENT_LINK" && ! -L "$CURRENT_LINK" ]]; then
  log "$CURRENT_LINK exists but is not a symbolic link."
  log "Refusing deployment for safety."
  exit 1
fi


# ============================================================
# DEPLOYMENT LOCK
# ============================================================

exec 9>"$DEPLOY_LOCK_FILE"

if ! flock -n 9; then
  log "Another HRMS backend deployment is already running."
  exit 1
fi


# ============================================================
# REQUIRED RELEASE FILES
# ============================================================

required_files=(
  "$RELEASE_DIR/package.json"
  "$RELEASE_DIR/package-lock.json"
  "$RELEASE_DIR/REVISION"
  "$RELEASE_DIR/dist/main.js"
  "$RELEASE_DIR/dist/database/data-source.js"
  "$SHARED_DIR/.env"
  "$SHARED_DIR/ecosystem.config.js"
)

for required in "${required_files[@]}"; do
  if [[ ! -e "$required" ]]; then
    log "Required deployment file is missing:"
    log "$required"
    exit 1
  fi
done


# ============================================================
# COMPILED MIGRATION VALIDATION
# ============================================================

if [[ ! -d "$RELEASE_DIR/dist/database/migrations" ]]; then
  log "Compiled migration directory is missing:"
  log "$RELEASE_DIR/dist/database/migrations"
  exit 1
fi


# ============================================================
# REVISION VALIDATION
# ============================================================

ACTUAL_REVISION="$(
  tr -d '[:space:]' < "$RELEASE_DIR/REVISION"
)"

if [[ "$ACTUAL_REVISION" != "$RELEASE_ID" ]]; then
  log "Artifact revision mismatch."
  log "Expected: $RELEASE_ID"
  log "Found:    $ACTUAL_REVISION"
  exit 1
fi


# ============================================================
# PREPARE RELEASE
# ============================================================

cd "$RELEASE_DIR"

ln -sfn \
  "$SHARED_DIR/.env" \
  "$RELEASE_DIR/.env"

log "Deploying HRMS backend release:"
log "$RELEASE_ID"

log "Environment: $APP_ENV"
log "Application: $PM2_APP_NAME"

log "Node: $(node --version)"
log "npm:  $(npm --version)"


# ============================================================
# INSTALL PRODUCTION DEPENDENCIES
# ============================================================

log "Installing production dependencies."

npm ci \
  --omit=dev \
  --no-audit \
  --no-fund


# ============================================================
# VERIFY MIGRATION COMMAND
# ============================================================

if ! node -e "
const pkg = require('./package.json');

if (
  !pkg.scripts ||
  !pkg.scripts['migration:run:built']
) {
  process.exit(1);
}
"; then
  log "package.json does not contain migration:run:built."
  exit 1
fi


# ============================================================
# RUN DATABASE MIGRATIONS
# ============================================================

log "Running HRMS database migrations."

NODE_ENV=production \
APP_ENV="$APP_ENV" \
npm run migration:run:built


# ============================================================
# SWITCH CURRENT RELEASE
# ============================================================

log "Switching current release."

ln -sfn \
  "$RELEASE_DIR" \
  "$CURRENT_LINK"

CURRENT_SWITCHED=1


# ============================================================
# PM2
# ============================================================

log "Starting or reloading PM2 process."

export BASE_DIR
export PM2_APP_NAME
export APP_ENV
export APP_PORT

pm2 startOrReload \
  "$SHARED_DIR/ecosystem.config.js" \
  --only "$PM2_APP_NAME" \
  --update-env

pm2 save


# ============================================================
# HEALTH CHECK
# ============================================================

log "Waiting for health endpoint:"
log "$HEALTH_URL"

HEALTH_CODE="000"
HEALTH_OK=0

for attempt in {1..30}; do
  HEALTH_CODE="$(
    curl \
      -sS \
      -o /dev/null \
      -w '%{http_code}' \
      --connect-timeout 3 \
      --max-time 10 \
      "$HEALTH_URL" \
      || true
  )"

  if [[ "$HEALTH_CODE" == "200" ]]; then
    HEALTH_OK=1
    log "Health check passed."
    break
  fi

  log "Health check attempt $attempt/30 returned HTTP $HEALTH_CODE."

  sleep 2
done

if [[ "$HEALTH_OK" != "1" ]]; then
  log "Health check failed."
  exit 1
fi


# ============================================================
# RELEASE CLEANUP
# ============================================================

log "Keeping newest $KEEP_RELEASES releases."

CURRENT_RELEASE="$(
  readlink -f "$CURRENT_LINK"
)"

find "$RELEASES_DIR" \
  -mindepth 1 \
  -maxdepth 1 \
  -type d \
  -printf '%T@ %p\n' \
  | sort -nr \
  | awk -v keep="$KEEP_RELEASES" \
      'NR > keep {
         sub(/^[^ ]+ /, "");
         print
       }' \
  | while IFS= read -r old_release; do

      [[ -n "$old_release" ]] || continue

      if [[ "$old_release" == "$CURRENT_RELEASE" ]]; then
        log "Preserving active release: $old_release"
        continue
      fi

      if [[ -n "$PREVIOUS_RELEASE" && \
            "$old_release" == "$PREVIOUS_RELEASE" ]]; then
        log "Preserving previous release: $old_release"
        continue
      fi

      log "Removing old release:"
      log "$old_release"

      rm -rf -- "$old_release"
    done


# ============================================================
# SUCCESS
# ============================================================

trap - ERR

log "HRMS backend deployment completed successfully."
log "Release:"
log "$RELEASE_ID"