# Backend Phases 7–10: delivery and operations

Verified against the repository on 2026-10-19.

## Phase 7 — Offboarding

Asset-return and settlement-overdue events have in-app and email listeners. The listeners use per-day deduplication keys, and unit specs cover both event handlers. The real-Postgres `offboarding-access-termination.e2e-spec.ts` suite covers access termination success/failure plus overdue asset and settlement sweeps. Its reminder case verifies the cron query finds persisted overdue rows, increments each reminder counter once, emits the expected event, and suppresses duplicate events on an immediate repeat sweep. This was run against the dedicated local `hrms_test_db`; it is not UAT evidence. Retain these checks when changing overdue schedulers or notification routing.

## Phase 8 — Notifications, self-service, and reporting

SMS delivery uses the configured SMS gateway. Mobile push uses Expo Push Service:

1. Link the mobile app to its EAS project so the runtime supplies `Constants.easConfig.projectId`.
2. Configure the app's APNs/FCM credentials in EAS and set `EXPO_ACCESS_TOKEN` on the backend when Expo push access-token security is enabled.
3. Apply the notification push-device/receipt migration.
4. Deploy the mobile app. On sign-in it requests permission, registers its Expo token against the active company membership, and unregisters the token on logout.
5. Enable the `PUSH` global notification channel only after the app/provider setup is ready. Device tokens are membership-scoped; Expo receipts are checked every 15 minutes and permanently unregistered devices are deactivated.

Expo acceptance tickets mean that Expo accepted a message for processing. They do not confirm receipt by a handset. The backend stores receipt status separately. Expo does not provide an end-to-end delivery SLA.

Scheduled reports have execution and delivery e2e coverage. Existing self-service APIs remain tenant/employee scoped. Verify notification preferences and channel rules in UAT, including denied permissions, multiple devices, token rotation, logout, provider errors, and stale-token receipts.

## Phase 9 — Deployment and operations

The repository includes release-based PM2 deploy/rollback, CI, deployment preflight, readiness/liveness endpoints, request correlation IDs, Helmet, and database backup before migrations. Use `deploy/hrms-backend/README.md` as the server setup and release procedure.

Before production sign-off, the service owner must configure external uptime/health alerting for `/api/health/live` and `/api/health/ready`, retain application and PM2 logs, alert on disk/database/Redis failures, and complete a restore drill into an isolated database. Record the tested backup, restore duration, and recovery point. Do not treat a successful backup command as proof that a backup is restorable.

## Phase 10 — Probation

The probation baseline seeder is registered in the seeder index, and probation endpoint/lifecycle e2e suites exist. Run them against the migration-backed UAT database and confirm the baseline policy and review criteria before inviting employees into the probation workflow.

## Change verification

The Phase 8 code changes have not been run against a live Expo project or mobile device. The EAS project ID and push credentials are environment-specific and must be supplied by the mobile release owner. Database migrations remain to be applied through the normal deployment pipeline.
