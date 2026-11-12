# KPI release migration candidates

These forward-only TypeORM migrations mirror the five validated KPI development schema steps. They are deliberately outside `src/database/migrations`, the only directory discovered by the normal release DataSource, and are excluded from `tsconfig.build.json` so they are not packaged. **Do not copy or register them for deployment** until the actual UAT migration ledger and schema have been compared, a sanitized representative upgrade has passed, and the release migration sequence has been reviewed.

The candidate classes have unique timestamps later than the current normal migration sequence. Their `up` methods deliberately fail if a table, column, constraint, function, trigger, or index already exists. They do not use `IF NOT EXISTS` to conceal schema divergence. `down` is disabled because recovery is a verified backup restore or reviewed forward fix, not an automatic destructive table drop.

Use `scripts/rehearse-kpi-release-candidates.ts` only against a dedicated, empty, loopback PostgreSQL database named with the `hrms_kpi_release_rehearsal_` prefix. The script applies the normal migration sequence first, then these candidates, and checks the expected schema. It refuses a nonempty database. It is not a deployment script.
