HRMS backend deployments use a release-based layout with one fully isolated tree
per environment.

Expected server structure:

- `/opt/apps/hrms-v1/uat/backend`
- `/opt/apps/hrms-v1/prod/backend`

Each environment keeps its own:

- `shared/.env`
- `shared/ecosystem.config.js`
- `shared/logs/`
- `releases/<git-sha>/`
- `current -> releases/<git-sha>`

GitHub Actions flow:

- `uat` runs the UAT deployment path in `HRMS Backend CI/CD`.
- `main` runs CI and publishes a production-ready artifact, but never deploys.
- Production deployment is started manually from `main` by selecting
  `production` in `HRMS Backend CI/CD`.
- CI builds one immutable artifact, verifies its checksum, then uploads it by
  SSH/SCP to the environment-specific server tree.
- `HRMS Backend Deployment Preflight` is a manual GitHub Action that verifies
  SSH, Node.js, PM2, permissions, the environment file, and health endpoint.
- `HRMS Backend Rollback` is a protected manual GitHub Action. Run it from the
  matching environment branch and provide an optional release SHA.

Deployment behavior:

- build once in CI, deploy the compiled artifact unchanged
- install production dependencies inside the staged release
- symlink the environment `.env` into the release
- run compiled TypeORM migrations with `migration:run:built`
- reload the environment-specific PM2 app
- verify `GET /api/health/ready`
- keep the current and previous releases plus the newest retained releases

Initial server setup:

- Run `deploy/hrms-backend/server-setup.sh` as root once for each environment.
- Use `DEPLOY_USER=alliance` and the appropriate `BASE_DIR`: either
  `/opt/apps/hrms-v1/uat/backend` or `/opt/apps/hrms-v1/prod/backend`.
- Populate each environment's `shared/.env` with its own secrets, `APP_ENV`,
  and `APP_PORT` before running the preflight workflow.
- Configure GitHub Environments named `hrms-backend-uat` and
  `hrms-backend-production`, each with `DEPLOY_HOST`, `DEPLOY_SSH_KEY`, and
  `DEPLOY_KNOWN_HOSTS`. Optional variables are `DEPLOY_USER` and `DEPLOY_PORT`.
- Require reviewers for `hrms-backend-production`; production deployment and
  rollback will then wait for explicit approval.
- The bootstrap script registers PM2 with systemd and installs log rotation;
  every successful deployment runs `pm2 save` so the service survives reboots.

Manual database reset:

- Set `DB_BACKUP_DIR` in each server-side `shared/.env` to a persistent,
  environment-specific location. Use
  `/opt/apps/hrms-v1/uat/backend/shared/backups/database` for UAT and
  `/opt/apps/hrms-v1/prod/backend/shared/backups/database` for production;
  never use a directory inside `current` or a release.
- From an active release, run `npm run db:reset:fresh:built`. It creates a
  PostgreSQL backup first, recreates the `public` schema, runs all compiled
  migrations, then runs compiled seeders.
- This operation permanently removes the current database contents. It is not
  part of CI/CD and must never be used against production without an approved
  recovery plan and a verified backup.

Environment-specific values enforced by the workflows:

- UAT: `APP_ENV=uat`, `APP_PORT=9999`, PM2 app `hrms-uat-api`
- Production: `APP_ENV=production`, `APP_PORT=8888`, PM2 app `hrms-prod-api`
