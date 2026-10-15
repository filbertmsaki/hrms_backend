#!/usr/bin/env bash

set -Eeuo pipefail

RELEASE_ID="${1:?usage: deploy.sh <release-id>}"

BASE_DIR="${BASE_DIR:?Set BASE_DIR}"
PM2_APP_NAME="${PM2_APP_NAME:?Set PM2_APP_NAME}"
APP_ENV="${APP_ENV:?Set APP_ENV}"
APP_HOST="${APP_HOST:?Set APP_HOST}"
APP_PORT="${APP_PORT:?Set APP_PORT}"
HEALTH_URL="${HEALTH_URL:?Set HEALTH_URL}"

KEEP_RELEASES="${KEEP_RELEASES:-3}"
BACKUP_BEFORE_MIGRATION="${BACKUP_BEFORE_MIGRATION:-false}"

RELEASES_DIR="$BASE_DIR/releases"
RELEASE_DIR="$RELEASES_DIR/$RELEASE_ID"

SHARED_DIR="$BASE_DIR/shared"
CURRENT_LINK="$BASE_DIR/current"

DEPLOY_LOCK_FILE="${DEPLOY_LOCK_FILE:-$SHARED_DIR/deploy.lock}"

PREVIOUS_RELEASE="$(
  readlink -f "$CURRENT_LINK" 2>/dev/null || true
)"

CURRENT_SWITCHED=0


log() {
  printf '[%s] %s\n' \
    "$(date '+%F %T')" \
    "$*"
}


require_package_script() {
  local script_name="${1:?Set script_name}"

  if ! node -e "
const pkg = require('./package.json');
process.exit(pkg.scripts?.['$script_name'] ? 0 : 1);
"; then
    log "Missing required package script: $script_name"
    exit 1
  fi
}


show_logs() {
  pm2 logs "$PM2_APP_NAME" \
    --lines 120 \
    --nostream || true
}


rollback() {
  if [[ "$CURRENT_SWITCHED" != "1" ]]; then
    log "Current release was not switched."
    log "Application rollback is not required."
    return
  fi

  if [[ -n "$PREVIOUS_RELEASE" && -d "$PREVIOUS_RELEASE" ]]; then
    log "Rolling back to previous release: $PREVIOUS_RELEASE"

    ln -sfn "$PREVIOUS_RELEASE" "$CURRENT_LINK.next"
    mv -Tf "$CURRENT_LINK.next" "$CURRENT_LINK"

    export BASE_DIR
    export PM2_APP_NAME
    export APP_ENV
    export APP_HOST
    export APP_PORT

    pm2 startOrReload \
      "$SHARED_DIR/ecosystem.config.js" \
      --only "$PM2_APP_NAME" \
      --update-env || true

    pm2 save || true

    log "Application rollback completed."
  else
    log "No previous release exists for rollback."
  fi
}


on_error() {
  local status=$?
  local line_number="${1:-unknown}"

  log "Deployment failed at line $line_number."
  log "Exit status: $status"

  show_logs
  rollback

  exit "$status"
}

trap 'on_error $LINENO' ERR


if [[ ! "$RELEASE_ID" =~ ^[0-9a-fA-F]{40}$ ]]; then
  log "Invalid release ID."
  log "Expected full 40-character Git SHA."
  exit 1
fi

case "$BACKUP_BEFORE_MIGRATION" in
  true|false)
    ;;
  *)
    log "BACKUP_BEFORE_MIGRATION must be 'true' or 'false'."
    exit 1
    ;;
esac


required_commands=(
  node
  npm
  pm2
  curl
  flock
  find
  sort
  awk
)

for command in "${required_commands[@]}"; do
  command -v "$command" >/dev/null || {
    log "Required command is missing: $command"
    exit 1
  }
done


mkdir -p \
  "$RELEASES_DIR" \
  "$SHARED_DIR" \
  "$SHARED_DIR/logs"


if [[ -e "$CURRENT_LINK" && ! -L "$CURRENT_LINK" ]]; then
  log "$CURRENT_LINK exists but is not a symbolic link."
  exit 1
fi


exec 9>"$DEPLOY_LOCK_FILE"

if ! flock -n 9; then
  log "Another HRMS backend deployment is running."
  exit 1
fi


required_files=(
  "$RELEASE_DIR/package.json"
  "$RELEASE_DIR/package-lock.json"
  "$RELEASE_DIR/REVISION"
  "$RELEASE_DIR/dist/main.js"
  "$RELEASE_DIR/dist/database/data-source.js"
  "$RELEASE_DIR/dist/scripts/drop-import-migrate-seed.js"
  "$RELEASE_DIR/src/database/seeds/dump/hrms_db_2026-09-28.dump"
  "$RELEASE_DIR/deploy/hrms-backend/register-src-alias.cjs"
  "$SHARED_DIR/.env"
  "$SHARED_DIR/ecosystem.config.js"
)


for required in "${required_files[@]}"; do
  if [[ ! -e "$required" ]]; then
    log "Missing required deployment file:"
    log "$required"
    exit 1
  fi
done


if [[ ! -d "$RELEASE_DIR/dist/database/migrations" ]]; then
  log "Compiled migrations directory is missing."
  exit 1
fi


ACTUAL_REVISION="$(
  tr -d '[:space:]' < "$RELEASE_DIR/REVISION"
)"

if [[ "$ACTUAL_REVISION" != "$RELEASE_ID" ]]; then
  log "Artifact revision mismatch."
  log "Expected: $RELEASE_ID"
  log "Found: $ACTUAL_REVISION"
  exit 1
fi


cd "$RELEASE_DIR"

ln -sfn \
  "$SHARED_DIR/.env" \
  "$RELEASE_DIR/.env"


log "Deploying HRMS backend release $RELEASE_ID"
log "Environment: $APP_ENV"
log "Application: $PM2_APP_NAME"
log "Node: $(node --version)"
log "npm: $(npm --version)"


log "Installing production dependencies."

npm ci \
  --omit=dev \
  --no-audit \
  --no-fund


require_package_script 'migration:run:built'

if [[ "$BACKUP_BEFORE_MIGRATION" == "true" ]]; then
  require_package_script 'db:backup:built'

  log "Creating database backup before migrations."

  NODE_ENV=production \
  APP_ENV="$APP_ENV" \
  npm run db:backup:built
fi


log "Running database migrations."

NODE_ENV=production \
APP_ENV="$APP_ENV" \
npm run migration:run:built


require_package_script 'seed:avatars:built'

log "Ensuring built-in default avatar files exist in persistent storage."

NODE_ENV=production \
APP_ENV="$APP_ENV" \
npm run seed:avatars:built


if [[ -n "$PREVIOUS_RELEASE" ]]; then
  printf '%s\n' "$PREVIOUS_RELEASE" > "$SHARED_DIR/previous-release"
fi


log "Switching current release."

ln -sfn "$RELEASE_DIR" "$CURRENT_LINK.next"
mv -Tf "$CURRENT_LINK.next" "$CURRENT_LINK"

CURRENT_SWITCHED=1


export BASE_DIR
export PM2_APP_NAME
export APP_ENV
export APP_HOST
export APP_PORT


log "Starting or reloading PM2."

pm2 startOrReload \
  "$SHARED_DIR/ecosystem.config.js" \
  --only "$PM2_APP_NAME" \
  --update-env

pm2 save


log "Checking health: $HEALTH_URL"

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

  log "Health attempt $attempt/30 returned HTTP $HEALTH_CODE."

  sleep 2
done


if [[ "$HEALTH_OK" != "1" ]]; then
  log "Health check failed."

  # An explicit exit does not fire the ERR trap, so surface the crash
  # output and restore the previous release here.
  show_logs
  rollback

  exit 1
fi


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

      log "Removing old release: $old_release"

      rm -rf -- "$old_release"
    done


trap - ERR

log "HRMS backend deployment completed successfully."
log "Release: $RELEASE_ID"
