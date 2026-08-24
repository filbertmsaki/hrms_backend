#!/usr/bin/env bash
set -Eeuo pipefail
umask 027

DEPLOY_USER="${DEPLOY_USER:-hrms-deploy}"
APP_ROOT="${APP_ROOT:-/opt/apps/hrms-v2}"

[[ "$EUID" -eq 0 ]] || {
  echo 'Run once with sudo/root.' >&2
  exit 1
}

id "$DEPLOY_USER" >/dev/null 2>&1 || {
  echo "Deployment user does not exist: $DEPLOY_USER" >&2
  exit 1
}

if id -nG "$DEPLOY_USER" \
  | tr ' ' '\n' \
  | grep -qxE 'sudo|wheel'; then
  echo "$DEPLOY_USER must not belong to sudo/wheel." >&2
  exit 1
fi

apt-get update

apt-get install -y \
  ca-certificates \
  curl \
  git \
  gzip \
  make \
  g++ \
  postgresql-client \
  python3 \
  tar \
  util-linux

command -v node >/dev/null || {
  echo 'Node.js is required.' >&2
  exit 1
}

command -v npm >/dev/null || {
  echo 'npm is required.' >&2
  exit 1
}

command -v pm2 >/dev/null || {
  echo 'PM2 is required.' >&2
  exit 1
}

NODE_MAJOR="$(
  node -p "process.versions.node.split('.')[0]"
)"

(( NODE_MAJOR >= 22 )) || {
  echo 'Node.js 22+ is required.' >&2
  exit 1
}

install \
  -d \
  -o "$DEPLOY_USER" \
  -g "$DEPLOY_USER" \
  -m 0750 \
  "$APP_ROOT"

for env_name in prod uat; do
  base="$APP_ROOT/$env_name/backend"

  install \
    -d \
    -o "$DEPLOY_USER" \
    -g "$DEPLOY_USER" \
    -m 0750 \
    "$APP_ROOT/$env_name" \
    "$base" \
    "$base/releases" \
    "$base/shared" \
    "$base/shared/logs" \
    "$base/shared/storage" \
    "$base/shared/storage/public"

  install \
    -d \
    -o "$DEPLOY_USER" \
    -g "$DEPLOY_USER" \
    -m 0700 \
    "$base/shared/storage/private" \
    "$base/shared/backups" \
    "$base/shared/backups/database" \
    "$base/tmp"

  if [[ ! -f "$base/shared/.env" ]]; then
    install \
      -o "$DEPLOY_USER" \
      -g "$DEPLOY_USER" \
      -m 0600 \
      /dev/null \
      "$base/shared/.env"
  else
    chown \
      "$DEPLOY_USER:$DEPLOY_USER" \
      "$base/shared/.env"

    chmod 0600 \
      "$base/shared/.env"
  fi
done

DEPLOY_HOME="$(
  getent passwd "$DEPLOY_USER" |
  cut -d: -f6
)"

[[ -n "$DEPLOY_HOME" &&
  -d "$DEPLOY_HOME" ]] || {
  echo 'Could not determine deploy home.' >&2
  exit 1
}

install \
  -d \
  -o "$DEPLOY_USER" \
  -g "$DEPLOY_USER" \
  -m 0700 \
  "$DEPLOY_HOME/.ssh"

touch \
  "$DEPLOY_HOME/.ssh/authorized_keys"

chown \
  "$DEPLOY_USER:$DEPLOY_USER" \
  "$DEPLOY_HOME/.ssh/authorized_keys"

chmod 0600 \
  "$DEPLOY_HOME/.ssh/authorized_keys"

chown \
  -R \
  "$DEPLOY_USER:$DEPLOY_USER" \
  "$APP_ROOT"

echo 'Server directory setup complete.'
echo "Deployment user: $DEPLOY_USER"
echo "Application root: $APP_ROOT"
echo
echo 'Do not configure PM2 systemd startup until at least one'
echo 'application has been started and saved by PM2.'
