# KPI release migrations

The five forward-only KPI migrations now live in `src/database/migrations/` as `1797900000000` through `1797900004000`. TypeORM discovers that directory during release. `scripts/rehearse-kpi-release-candidates.ts` imports them from there and is still only for an empty local rehearsal database.
