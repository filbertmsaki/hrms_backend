#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="/opt/apps/hrms/prod/backend"
BRANCH="main"

API_PM2_NAME="hrms-prod-api"
WEB_PM2_NAME="hrms-prod-web"

echo "Starting HRMS production deployment..."

cd "$APP_DIR"

echo "Fetching latest code..."
git fetch origin "$BRANCH"
git reset --hard "origin/$BRANCH"

echo "Installing dependencies..."
npm ci

echo "Building backend..."
npm run build

echo "Running database migrations..."
npm run migration:run

echo "Restarting PM2 API..."
sudo -n pm2 restart "$API_PM2_NAME" --update-env

echo "Restarting PM2 Web..."
sudo -n pm2 restart "$WEB_PM2_NAME" --update-env

echo "Saving PM2 process list..."
sudo -n pm2 save

echo "Deployment completed successfully."
