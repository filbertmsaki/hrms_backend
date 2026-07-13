#!/usr/bin/env bash
set -Eeuo pipefail

DEPLOY_SHA="${1:-}"

if [ -z "$DEPLOY_SHA" ]; then
  echo "Usage: $0 <commit-sha>"
  exit 1
fi

APP_DIR="${APP_DIR:-/opt/apps/hrms/prod/backend}"
ECOSYSTEM_FILE="${ECOSYSTEM_FILE:-/opt/apps/hrms/ecosystem.config.js}"
BRANCH="${BRANCH:-main}"

API_PM2_NAME="${API_PM2_NAME:-hrms-prod-api}"
WEB_PM2_NAME="${WEB_PM2_NAME:-hrms-prod-web}"
APP_PORT="${APP_PORT:-8888}"
PREVIOUS_SHA_FILE="${PREVIOUS_SHA_FILE:-$APP_DIR/.previous-deploy-sha}"

echo "======================================"
echo "HRMS Production Deployment Started"
echo "======================================"
echo "Target directory: $APP_DIR"
echo "Target commit: $DEPLOY_SHA"

cd "$APP_DIR"

echo "Current directory: $(pwd)"
echo "Current user: $(whoami)"

echo "Fetching latest code from GitHub..."
git fetch origin "$BRANCH"

if ! git cat-file -e "${DEPLOY_SHA}^{commit}" 2>/dev/null; then
  echo "ERROR: commit $DEPLOY_SHA is not available after fetch."
  exit 1
fi

if ! git merge-base --is-ancestor "$DEPLOY_SHA" "origin/$BRANCH"; then
  echo "ERROR: commit $DEPLOY_SHA is not part of origin/$BRANCH."
  exit 1
fi

CURRENT_SHA="$(git rev-parse HEAD)"
echo "Current commit before deploy: $CURRENT_SHA"
echo "$CURRENT_SHA" > "$PREVIOUS_SHA_FILE"

echo "Checking out commit $DEPLOY_SHA..."
git checkout --force "$DEPLOY_SHA"

echo "Checking Node and npm versions..."
node -v
npm -v

echo "Installing dependencies using npm ci..."
npm ci

echo "Building NestJS backend..."
npm run build

echo "Checking build output..."
if [ ! -f "$APP_DIR/dist/main.js" ]; then
  echo "ERROR: dist/main.js was not found."
  echo "Available main.js files:"
  find "$APP_DIR/dist" -name "main.js" -type f || true
  exit 1
fi

echo "Running TypeORM migrations..."
npm run migration:run

echo "Reloading PM2 backend: $API_PM2_NAME"
sudo -n pm2 reload "$ECOSYSTEM_FILE" --only "$API_PM2_NAME" --update-env

echo "Reloading PM2 web: $WEB_PM2_NAME"
sudo -n pm2 reload "$ECOSYSTEM_FILE" --only "$WEB_PM2_NAME" --update-env

echo "Saving PM2 process list..."
sudo -n pm2 save

echo "Checking backend health on port $APP_PORT..."
for i in {1..30}; do
  HTTP_CODE="$(curl -sS -o /dev/null -w "%{http_code}" "http://127.0.0.1:${APP_PORT}/api" || true)"

  if [[ "$HTTP_CODE" =~ ^(2|3|4) ]]; then
    echo "Backend is responding. HTTP status: $HTTP_CODE"
    break
  fi

  echo "Waiting for backend to start... attempt $i/30, status=$HTTP_CODE"
  sleep 1
done

if ! [[ "$HTTP_CODE" =~ ^(2|3|4) ]]; then
  echo "Backend health check failed. HTTP status: $HTTP_CODE"
  echo "Previous commit saved in $PREVIOUS_SHA_FILE: $(cat "$PREVIOUS_SHA_FILE")"
  echo "Showing PM2 backend logs..."
  sudo -n pm2 logs "$API_PM2_NAME" --lines 80 --nostream
  exit 1
fi

echo "Deployment succeeded at commit $DEPLOY_SHA"
echo "======================================"
echo "HRMS Production Deployment Completed"
echo "======================================"
