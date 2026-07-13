#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="/opt/apps/hrms/prod/backend"
ECOSYSTEM_FILE="/opt/apps/hrms/ecosystem.config.js"
BRANCH="main"

API_PM2_NAME="hrms-prod-api"
WEB_PM2_NAME="hrms-prod-web"
APP_PORT="8888"

echo "======================================"
echo "HRMS Production Deployment Started"
echo "======================================"

cd "$APP_DIR"

echo "Current directory: $(pwd)"
echo "Current user: $(whoami)"

echo "Fetching latest code from GitHub..."
git fetch origin "$BRANCH"

echo "Resetting code to origin/$BRANCH..."
git reset --hard "origin/$BRANCH"

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
  echo "Showing PM2 backend logs..."
  sudo -n pm2 logs "$API_PM2_NAME" --lines 80 --nostream
  exit 1
fi

echo "======================================"
echo "HRMS Production Deployment Completed"
echo "======================================"
