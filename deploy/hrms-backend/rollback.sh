#!/usr/bin/env bash

set -Eeuo pipefail

TARGET_ID="${1:-}"

BASE_DIR="${BASE_DIR:?Set BASE_DIR}"
PM2_APP_NAME="${PM2_APP_NAME:?Set PM2_APP_NAME}"
APP_ENV="${APP_ENV:?Set APP_ENV}"
APP_HOST="${APP_HOST:?Set APP_HOST}"
APP_PORT="${APP_PORT:?Set APP_PORT}"
HEALTH_URL="${HEALTH_URL:?Set HEALTH_URL}"

RELEASES_DIR="$BASE_DIR/releases"
SHARED_DIR="$BASE_DIR/shared"
CURRENT_LINK="$BASE_DIR/current"
PREVIOUS_RELEASE_FILE="$SHARED_DIR/previous-release"
LOCK_FILE="$SHARED_DIR/deploy.lock"

log() {
  printf '[%s] %s\n' "$(date '+%F %T')" "$*"
}

health_check() {
  for attempt in {1..30}; do
    if curl --fail --silent --show-error --max-time 5 "$HEALTH_URL" >/dev/null; then
      return 0
    fi

    log "Rollback health attempt $attempt/30 failed."
    sleep 2
  done

  return 1
}

for command in curl flock pm2 readlink mv; do
  command -v "$command" >/dev/null || {
    echo "Required command is missing: $command" >&2
    exit 1
  }
done

[[ -L "$CURRENT_LINK" ]] || {
  echo 'No active release exists to roll back.' >&2
  exit 1
}

CURRENT_RELEASE="$(readlink -f "$CURRENT_LINK")"

if [[ -z "$TARGET_ID" ]]; then
  [[ -f "$PREVIOUS_RELEASE_FILE" ]] || {
    echo 'No previous release marker exists.' >&2
    exit 1
  }

  TARGET_RELEASE="$(tr -d '\r\n' < "$PREVIOUS_RELEASE_FILE")"
else
  [[ "$TARGET_ID" =~ ^[0-9a-fA-F]{40}$ ]] || {
    echo 'Rollback release ID must be a full 40-character Git SHA.' >&2
    exit 1
  }

  TARGET_RELEASE="$RELEASES_DIR/$TARGET_ID"
fi

TARGET_RELEASE="$(readlink -f "$TARGET_RELEASE")"

[[ -d "$TARGET_RELEASE" && -f "$TARGET_RELEASE/dist/main.js" ]] || {
  echo "Invalid rollback release: $TARGET_RELEASE" >&2
  exit 1
}

[[ "$TARGET_RELEASE" != "$CURRENT_RELEASE" ]] || {
  log 'Requested rollback release is already active.'
  exit 0
}

[[ "$TARGET_RELEASE" == "$RELEASES_DIR"/* ]] || {
  echo 'Rollback target must be inside the environment releases directory.' >&2
  exit 1
}

exec 9>"$LOCK_FILE"
flock -n 9 || {
  echo 'Another deployment or rollback is running.' >&2
  exit 1
}

log "Rolling back from $CURRENT_RELEASE to $TARGET_RELEASE"

ln -sfn "$TARGET_RELEASE" "$CURRENT_LINK.next"
mv -Tf "$CURRENT_LINK.next" "$CURRENT_LINK"

export BASE_DIR PM2_APP_NAME APP_ENV APP_HOST APP_PORT
pm2 startOrReload "$SHARED_DIR/ecosystem.config.js" --only "$PM2_APP_NAME" --update-env

if ! health_check; then
  log 'Rollback target failed health checks. Restoring the original release.'
  ln -sfn "$CURRENT_RELEASE" "$CURRENT_LINK.next"
  mv -Tf "$CURRENT_LINK.next" "$CURRENT_LINK"
  pm2 startOrReload "$SHARED_DIR/ecosystem.config.js" --only "$PM2_APP_NAME" --update-env || true
  exit 1
fi

printf '%s\n' "$CURRENT_RELEASE" > "$PREVIOUS_RELEASE_FILE"
pm2 save

log "Rollback completed successfully: $(basename "$TARGET_RELEASE")"
