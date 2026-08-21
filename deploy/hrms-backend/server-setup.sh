#!/usr/bin/env bash

set -Eeuo pipefail

# Run once per environment as root. Normal CI/CD deployments use no sudo.

DEPLOY_USER="${DEPLOY_USER:-alliance}"
BASE_DIR="${BASE_DIR:?Set BASE_DIR, for example /opt/apps/hrms-v1/uat/backend}"
REQUIRED_NODE_MAJOR="${REQUIRED_NODE_MAJOR:-22}"

[[ "$EUID" -eq 0 ]] || {
  echo 'Run this server setup script as root or through sudo.' >&2
  exit 1
}

id "$DEPLOY_USER" >/dev/null 2>&1 || {
  echo "Deployment user does not exist: $DEPLOY_USER" >&2
  exit 1
}

apt-get update
apt-get install -y ca-certificates curl gzip make g++ postgresql-client python3 tar util-linux

command -v node >/dev/null || {
  echo "Install Node.js $REQUIRED_NODE_MAJOR or later before continuing." >&2
  exit 1
}

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
(( NODE_MAJOR >= REQUIRED_NODE_MAJOR )) || {
  echo "Node.js $REQUIRED_NODE_MAJOR or later is required." >&2
  exit 1
}

command -v npm >/dev/null || {
  echo 'npm is required.' >&2
  exit 1
}

command -v pm2 >/dev/null || npm install -g pm2

DEPLOY_HOME="$(getent passwd "$DEPLOY_USER" | cut -d: -f6)"

[[ -n "$DEPLOY_HOME" && -d "$DEPLOY_HOME" ]] || {
  echo "Could not determine home directory for $DEPLOY_USER." >&2
  exit 1
}

for directory in \
  "$BASE_DIR" \
  "$BASE_DIR/releases" \
  "$BASE_DIR/shared" \
  "$BASE_DIR/shared/backups" \
  "$BASE_DIR/shared/logs" \
  "$BASE_DIR/tmp"; do
  install -d -o "$DEPLOY_USER" -g "$DEPLOY_USER" -m 0755 "$directory"
done

ENV_FILE="$BASE_DIR/shared/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  install -o "$DEPLOY_USER" -g "$DEPLOY_USER" -m 0600 /dev/null "$ENV_FILE"
else
  chown "$DEPLOY_USER:$DEPLOY_USER" "$ENV_FILE"
  chmod 0600 "$ENV_FILE"
fi

chown -R "$DEPLOY_USER:$DEPLOY_USER" "$BASE_DIR"
chmod 0600 "$ENV_FILE"

runuser -u "$DEPLOY_USER" -- node --version
runuser -u "$DEPLOY_USER" -- npm --version
runuser -u "$DEPLOY_USER" -- pm2 --version

# PM2 uses this systemd unit to restore the process list saved by deploy.sh.
pm2 startup systemd -u "$DEPLOY_USER" --hp "$DEPLOY_HOME"
runuser -u "$DEPLOY_USER" -- pm2 install pm2-logrotate

echo "Server setup complete for $BASE_DIR"
