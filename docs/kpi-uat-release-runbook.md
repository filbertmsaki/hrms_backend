# KPI UAT integration and release runbook (draft; no remote action authorized)

## Current gate

The five forward-only KPI migration candidates are in `src/database/kpi-release-candidates/`. They are excluded from the production build and normal TypeORM discovery. The fresh path passed locally. The real UAT ledger/schema and a sanitized representative UAT upgrade and restore rehearsal are still required before these files can be promoted into `src/database/migrations/`. The repository variable `KPI_UAT_AUTO_DEPLOY_ENABLED` must remain unset or `false` in **both** repositories until the first approved UAT release has passed. It is evaluated at the job level, so it must be a repository or organization variable, not an environment-only variable.

The old Performance Management code remains intentionally removed. Existing legacy tables and migration ledger rows must remain untouched until a separate data-disposition decision. Do not use `migration:revert`, `db:reset:fresh`, or the manual dump importer as a release rollback.

**Verified current UAT behavior (2026-11-06):** A backend push to `uat` runs hosted checks and then deploys on the existing self-hosted UAT runner. The last successful run executed `migration:run:built` before switching the application release and passing health checks. The UAT GitHub Environment currently sets `BACKUP_BEFORE_MIGRATION=false`; that run did **not** execute the backup step. This must be corrected and the persistent backup destination/restore procedure verified before any KPI migration files are pushed. Migration files are prepared and rehearsed locally, committed with the approved release, then applied as pending migrations by the existing UAT deploy job. They do not remain local. No separate migration deployment mechanism is planned.

## Checkpoint 1: obtain UAT metadata (existing authorized runner, read-only)

The existing self-hosted backend deploy runner uses the protected UAT `shared/.env` connection. After separate authorization for a read-only UAT metadata operation, dispatch **HRMS Backend CI/CD** on the approved `uat` revision with `environment=uat` and `metadata_only=true`. This job runs the normal CI checks, downloads and verifies the compiled artifact, then executes the checked-in `docs/kpi-uat-metadata.sql` inside a read-only transaction. It saves only schema and migration metadata to a new owner-only file at `shared/kpi-uat-metadata-<run-id>-<attempt>.json` and prints no credentials or result rows. The deploy job is skipped for this dispatch; no backup, migration, or application switch occurs. Never put this export in an artifact, repository, or public log.

The operator must first verify the approved revision, protected environment, and database identity out of band. The output is reviewed through an approved secure channel. This is a read-only inspection, not permission to run migrations or deploy. Until this operation is authorized and executed, **actual UAT compatibility is unknown**. If the existing runner cannot safely execute it, use the DBA fallback below.

### DBA fallback

An authorized DBA should confirm the target database out of band, use a read-only account, and run the repository's `docs/kpi-uat-metadata.sql` with a short statement timeout. The SQL selects only migration and schema metadata; no employee or appraisal rows. Example using a DBA-managed PostgreSQL service definition:

```bash
umask 077
PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=15000' \
  psql 'service=hrms-uat-readonly' -X -v ON_ERROR_STOP=1 \
  -f docs/kpi-uat-metadata.sql -o /secure/path/kpi-uat-metadata.txt
```

The DBA should inspect the output before sharing it through an approved secure channel. Do not send connection strings, passwords, or business table data. Compare applied names/timestamps, table/column shapes, indexes, triggers, functions, enums, and foreign keys against the current migration source and the 12 deleted legacy KPI/performance migrations. An applied migration identifier is not its execution timestamp. A source file edited after application must not be treated as proof that UAT has the edited schema.

**Approval checkpoint:** review the metadata comparison and any legacy data/foreign-key dependencies. Stop on unexpected names, missing base tables, or a previously applied candidate migration.

## Checkpoint 2: representative upgrade and recovery rehearsal

The DBA prepares a **sanitized** representative UAT schema, migration ledger, and minimal relationship data in a separate local or approved nonproduction PostgreSQL database. Confirm it contains no employee personal information. Rehearse the exact five ordered candidate `up` methods in one TypeORM transaction and compare the before/after table inventory, ledger, constraints, and preserved row counts. The candidate SQL intentionally fails on object-name conflicts. Never delete ledger rows or drop legacy tables to make it pass.

For backup recovery, create a custom-format dump in owner-only storage, run `pg_restore --list`, record its SHA-256, restore into another isolated database with `pg_restore --exit-on-error`, and compare schema and migration-ledger counts. A successful dump command alone does not prove restoration. Do not rehearse against working `hrms_db`, UAT, or production.

**Approval checkpoint:** approve the reconciliation, candidate schema, observed upgrade time, backup integrity, restore result, and disposition of legacy tables. If the representative copy is unavailable, UAT migration and deployment remain blocked.

## Checkpoint 3: promote and validate the migration sequence locally

After checkpoint 2, copy the reviewed candidate files into `src/database/migrations/` with their unique `1797900000000`–`1797900004000` class identifiers; remove the candidate build exclusion. Preserve all historical migration files and applied ledger rows. Re-run the **normal compiled** migration command on both empty and representative sanitized databases. Check `showMigrations()` reports exactly the intended pending classes, then verify the schema, foreign keys, indexes, triggers, and application startup. Do not run the development-only migration runners during release.

Backend and frontend Git worktrees are currently mixed with intentional legacy removal and unrelated HRMS edits. Review an explicit path list for each proposed commit; never stage all files blindly. Keep the baseline archive, `.env*` secrets, database dumps, and private synthetic data out of both repositories. Push only reviewed compatible backend/frontend revisions after separate approval. Both `uat` workflows build/package on push. Deployment is manual while `KPI_UAT_AUTO_DEPLOY_ENABLED` is unset or `false`. After the first approved release and upgrade rehearsal, setting that variable to `true` in each repository permits the existing deploy job to run automatically after its required CI jobs pass. Backend and frontend workflows are independent; approve compatible revision ordering and deploy backend before frontend.

Use `docs/kpi-release-file-manifest.md` as the review draft. Record the approved backend and frontend 40-character Git SHAs here after review; neither SHA has been approved yet. Confirm both revisions use the existing dashboard shell, sidebar, JWT/session, permission rules, and company scope.

## Checkpoint 4: controlled UAT rollout (requires explicit remote approval)

1. Confirm the approved backend and frontend Git SHAs and CI artifacts, checksums, and required configuration. Confirm `KPI_*` feature flags are disabled in UAT before rollout.
2. Confirm a recent database backup and an isolated restore rehearsal. UAT and production deployment scripts require `BACKUP_BEFORE_MIGRATION=true`. Use custom-format backup storage under the environment's protected `shared/backups/database/` path. Verify the actual dump with `pg_restore --list` and a recorded checksum before authorizing migration execution.
3. Re-run the read-only metadata query immediately before migration and compare it with the approved preflight. Any drift stops the rollout.
4. After metadata comparison, isolated representative upgrade/restore rehearsal, migration promotion, approved backend revision, and verified `BACKUP_BEFORE_MIGRATION=true`, push the reviewed backend revision to `uat` under the existing approved automatic UAT deployment gate. Its intended order is: required CI checks → package checksum → install production dependencies in a new release tree → read-only KPI ledger/schema preflight → mandatory database backup → compiled forward migrations → switch application symlink → PM2 reload → `/api/health/ready`. The old application remains live while additive migrations run; the representative rehearsal must establish compatibility with that order. The preflight fails if the five reviewed migrations are missing, partly applied, or collide with the expected object names. A failure stops deployment before backup or migration; review it rather than editing ledger rows.
5. Verify backend health, authentication, employee/department/branch reads, existing reports and notifications, and that KPI endpoints remain disabled. Inspect PM2 and structured logs for migration, connection, 5xx, and authorization errors.
6. After backend health and disabled-state smoke tests pass, push the compatible approved frontend revision to `uat` through its existing automatic workflow; verify login, existing dashboard, and API proxy. Enable KPI flags only after a separate approval. Where the local opt-in workflow gate is included in the release, an authorized repository administrator must set `KPI_UAT_AUTO_DEPLOY_ENABLED=true` only after all migration and backup gates pass. Backend and frontend pushes are separate; push and verify the backend first.
7. With approved synthetic/designated UAT accounts, verify role-specific links in the existing sidebar for company admin, HR manager, department manager, branch manager, management, and employee; verify active group state, mobile drawer behavior, and that deleted legacy performance links are absent. Then verify definition → assignment → achievement/evidence → manager approval → scorecard → evaluation/HR review/finalization → analytics, including tenant denials and frozen historical snapshots. Record evidence without creating fictional real-employee results.
8. Monitor health, PM2, 5xx/authorization anomalies, database connections and slow queries, failed submissions/approvals/evidence, scoring and evaluation errors, action inbox/notification failures, orphan/duplicate KPI records, and migration ledger drift using existing logs, PostgreSQL views, and audit facilities. Do not log credentials, appraisal text, or private evidence paths. Set alert levels from observed UAT baselines and current operational conventions.

**Recovery:** If failure occurs before symlink switch, the current application remains live. If it occurs after switch, the existing rollback action restores the previous application release. Database schema is not reversed automatically; keep KPI disabled and use a reviewed forward fix or restore the verified backup after explicit incident approval. Test this decision path during the representative rehearsal.

## Maintenance

Reproduce a KPI defect, record it in `STATE.md` or the issue tracker, make a focused change with a regression test, run local and isolated schema tests, review API/UI and historical compatibility, then use reviewed commits/PRs and the existing `uat` push pipeline after approval. Migration files are committed and applied by that pipeline; smoke test and monitor each release, and promote to production only by separate authorization. Never edit the applied migration ledger as a shortcut.
