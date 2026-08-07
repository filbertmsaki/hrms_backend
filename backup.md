npm run db:restore:dry-run
npm run db:restore:latest -- --yes
npm run db:restore -- --file backups/database/hrms_db-20260807-154253.dump --yes
npm run db:restore -- --file backups/database/hrms_db-20260807-154253.dump --recreate-db --yes