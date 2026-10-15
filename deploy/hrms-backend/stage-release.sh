#!/usr/bin/env bash

set -Eeuo pipefail

RELEASE_ID="${1:?usage: stage-release.sh <release-id> <archive>}"
ARCHIVE_FILE="${2:?usage: stage-release.sh <release-id> <archive>}"

BASE_DIR="${BASE_DIR:?Set BASE_DIR}"
PM2_APP_NAME="${PM2_APP_NAME:?Set PM2_APP_NAME}"
APP_ENV="${APP_ENV:?Set APP_ENV}"
APP_HOST="${APP_HOST:?Set APP_HOST}"
APP_PORT="${APP_PORT:?Set APP_PORT}"
HEALTH_URL="${HEALTH_URL:?Set HEALTH_URL}"
KEEP_RELEASES="${KEEP_RELEASES:-3}"
BACKUP_BEFORE_MIGRATION="${BACKUP_BEFORE_MIGRATION:-false}"

RELEASES_DIR="$BASE_DIR/releases"
SHARED_DIR="$BASE_DIR/shared"
RELEASE_DIR="$RELEASES_DIR/$RELEASE_ID"
STAGING_DIR=""
RELEASE_CONTENT_DIR=""

cleanup() {
  local status=$?

  rm -f -- "$ARCHIVE_FILE" || true
  rm -f -- "$0" || true

  if [[ -n "$STAGING_DIR" && -d "$STAGING_DIR" ]]; then
    rm -rf -- "$STAGING_DIR" || true
  fi

  exit "$status"
}

trap cleanup EXIT

[[ "$RELEASE_ID" =~ ^[0-9a-fA-F]{40}$ ]] || {
  echo 'Release ID must be a full 40-character Git SHA.' >&2
  exit 1
}

[[ -f "$ARCHIVE_FILE" ]] || {
  echo "Release archive does not exist: $ARCHIVE_FILE" >&2
  exit 1
}

[[ -d "$RELEASES_DIR" && -d "$SHARED_DIR" ]] || {
  echo 'The deployment directory structure is incomplete.' >&2
  exit 1
}

command -v tar >/dev/null
command -v install >/dev/null

if [[ -e "$RELEASE_DIR" ]]; then
  [[ -d "$RELEASE_DIR" ]] || {
    echo "Existing release path is not a directory: $RELEASE_DIR" >&2
    exit 1
  }
  echo "Reusing existing release for deployment retry: $RELEASE_DIR"
  RELEASE_CONTENT_DIR="$RELEASE_DIR"
else
  while IFS= read -r archive_path; do
    case "$archive_path" in
      /*|../*|*/../*|*/..)
        echo "Unsafe archive path: $archive_path" >&2
        exit 1
        ;;
    esac
  done < <(tar -tzf "$ARCHIVE_FILE")

  STAGING_DIR="$(mktemp -d "$RELEASES_DIR/.staging-$RELEASE_ID.XXXXXX")"
  tar -xzf "$ARCHIVE_FILE" -C "$STAGING_DIR"
  RELEASE_CONTENT_DIR="$STAGING_DIR"
fi

required_files=(
  "$RELEASE_CONTENT_DIR/package.json"
  "$RELEASE_CONTENT_DIR/package-lock.json"
  "$RELEASE_CONTENT_DIR/REVISION"
  "$RELEASE_CONTENT_DIR/dist/main.js"
  "$RELEASE_CONTENT_DIR/dist/database/data-source.js"
  "$RELEASE_CONTENT_DIR/dist/scripts/drop-import-migrate-seed.js"
  "$RELEASE_CONTENT_DIR/src/database/seeds/dump/hrms_db_2026-09-28.dump"
  "$RELEASE_CONTENT_DIR/deploy/hrms-backend/deploy.sh"
  "$RELEASE_CONTENT_DIR/deploy/hrms-backend/ecosystem.config.js"
  "$RELEASE_CONTENT_DIR/deploy/hrms-backend/register-src-alias.cjs"
)

for required_file in "${required_files[@]}"; do
  [[ -f "$required_file" ]] || {
    echo "Missing release file: $required_file" >&2
    exit 1
  }
done

[[ "$(tr -d '[:space:]' < "$RELEASE_CONTENT_DIR/REVISION")" == "$RELEASE_ID" ]] || {
  echo 'Artifact revision does not match the requested release.' >&2
  exit 1
}

if [[ -n "$STAGING_DIR" ]]; then
  mv "$STAGING_DIR" "$RELEASE_DIR"
  STAGING_DIR=""
fi

install -m 0640 \
  "$RELEASE_DIR/deploy/hrms-backend/ecosystem.config.js" \
  "$SHARED_DIR/ecosystem.config.js"

chmod 0750 "$RELEASE_DIR/deploy/hrms-backend/deploy.sh"

BASE_DIR="$BASE_DIR" \
PM2_APP_NAME="$PM2_APP_NAME" \
APP_ENV="$APP_ENV" \
APP_HOST="$APP_HOST" \
APP_PORT="$APP_PORT" \
HEALTH_URL="$HEALTH_URL" \
KEEP_RELEASES="$KEEP_RELEASES" \
BACKUP_BEFORE_MIGRATION="$BACKUP_BEFORE_MIGRATION" \
bash "$RELEASE_DIR/deploy/hrms-backend/deploy.sh" "$RELEASE_ID"
