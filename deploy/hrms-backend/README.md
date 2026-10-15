HRMS backend deployments use a release-based layout with one fully isolated tree
per environment.

Expected server structure:

- `/opt/apps/hrms-v1/uat/backend`
- `/opt/apps/hrms-v1/prod/backend`

Each environment keeps its own:

- `shared/.env`
- `shared/ecosystem.config.js`
- `shared/logs/`
- `shared/storage/public/`
- `shared/storage/private/`
- `shared/backups/database/`
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
- optionally run `db:backup:built` before migrations when `BACKUP_BEFORE_MIGRATION=true`
- run compiled TypeORM migrations with `migration:run:built`
- reload the environment-specific PM2 app
- verify `GET /api/health/ready`
- keep the current and previous releases plus the newest retained releases

Initial server setup:

- Run `deploy/hrms-backend/server-setup.sh` as root once for each environment.
- Use an environment-specific non-sudo deploy user such as `hrms-uat` or
  `hrms-prod`, plus the appropriate `BASE_DIR`.
- Populate each environment's `shared/.env` with its own secrets, `APP_ENV`,
  `APP_HOST`, `APP_PORT`, `APP_URL`, and `APP_FRONTEND_URL` before running the
  preflight workflow. `APP_URL` and `APP_FRONTEND_URL` must be the public URLs
  for that environment; all email and SMS action links use them dynamically.
- Configure GitHub Environments named `hrms-backend-uat` and
  `hrms-backend-production`, each with secrets `DEPLOY_HOST`,
  `DEPLOY_SSH_KEY`, and `DEPLOY_KNOWN_HOSTS`.
- Set environment variables in GitHub for `DEPLOY_USER`, `BASE_DIR`,
  `PM2_APP_NAME`, `APP_ENV`, `APP_HOST`, `APP_PORT`, and `HEALTH_PATH`.
- Set `KEEP_RELEASES` per environment, and set `BACKUP_BEFORE_MIGRATION=true`
  for production if you want an automatic backup before migrations.
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

Restore the packaged HRMS database dump:

- From the active release, preview the operation with
  `npm run db:drop-import-migrate-seed -- --database hrms_db`.
- Verify `DB_BACKUP_DIR` points to persistent shared storage and the database
  connection values in `shared/.env` target the intended environment.
- The database role in `shared/.env` must have `CREATEDB` and own the target
  database. The importer checks these permissions before backing up or dropping
  the target.
- To execute on UAT, run
  `npm run db:drop-import-migrate-seed -- --execute --confirm-drop hrms_db`.
- The command backs up an existing target database, imports the packaged dump,
  then runs compiled migrations and the compiled standard seed chain. It is
  manual and is not part of deployment automation.

Environment-specific values enforced by the workflows:

- UAT: `APP_ENV=uat`, `APP_HOST=0.0.0.0`, `APP_PORT=9999`, PM2 app `hrms-uat-api`
- Production: `APP_ENV=production`, `APP_HOST=0.0.0.0`, `APP_PORT=8888`, PM2 app `hrms-prod-api`

Temporary public exposure note:

- If you are exposing the APIs directly on `:8888` and `:9999` before adding a
  reverse proxy and TLS, use `APP_HOST=0.0.0.0`.
- Once you have DNS and HTTPS in front of the backend, switch `APP_HOST` back
  to `127.0.0.1` and keep external access on `80/443` only.
