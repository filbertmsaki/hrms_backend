#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="/opt/apps/hrms/prod/backend"
BRANCH="main"

API_PM2_NAME="hrms-prod-api"
WEB_PM2_NAME="hrms-prod-web"

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

echo "Running TypeORM migrations..."
npm run migration:run

echo "Restarting PM2 backend: $API_PM2_NAME"
sudo -n pm2 restart "$API_PM2_NAME" --update-env

echo "Restarting PM2 web: $WEB_PM2_NAME"
sudo -n pm2 restart "$WEB_PM2_NAME" --update-env

echo "Saving PM2 process list..."
sudo -n pm2 save

APP_PORT="$(grep -E '^PORT=' .env 2>/dev/null | cut -d '=' -f2- | tr -d '\"' | tr -d "'"'"'" || true)"
APP_PORT="${APP_PORT:-3000}"

echo "Checking backend health on port $APP_PORT..."
curl -fsS "http://127.0.0.1:${APP_PORT}/" > /dev/null

echo "======================================"
echo "HRMS Production Deployment Completed"
echo "======================================"
