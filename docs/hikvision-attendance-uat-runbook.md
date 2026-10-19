# Hikvision attendance UAT runbook

Use a test employee and a short date range first. Run with an account that has `access_control_sync:execute` for the target company. Record the device model, firmware, serial number, branch, configured timezone, expected employee number, test window, and observed result.

## Device and capability check

1. Confirm the attendance device is active, configured for Hikvision pull sync, reachable from the backend, and has the correct timezone and credentials.
2. Call `GET /api/hikvision/devices/{deviceId}/attendance/capabilities`. Confirm the device responds successfully and record its supported page size. A capability lookup failure should be resolved before a large sync; the sync service otherwise falls back to its safe page size.

## Bounded sync

1. Create one recognizable test punch on the device for a test employee.
2. Call `POST /api/hikvision/devices/{deviceId}/attendance/sync-employee` with that employee number and a range covering the punch. Use an ISO 8601 range with the configured device offset.
3. Confirm the response reports the expected page and event counts, then inspect `GET /api/hikvision/devices/{deviceId}/attendance/logs` for the employee and time window.
4. Confirm the stored `event_time` represents the actual instant, `source_timezone` matches the device configuration, and the source payload is retained.

## Retry and deduplication

1. Repeat the same bounded sync. Confirm no duplicate attendance log is created and the sync history reports skipped duplicates.
2. During a controlled test window, briefly make the device unavailable, run a sync, restore connectivity, and rerun the same range. Confirm the failed attempt is visible in sync history and the rerun completes without duplicate events.
3. Confirm a partial or failed sync does not advance the automatic attendance cursor; the next scheduled sync must be able to recover the missed window.

4. For a failed or partial sync, confirm an in-app alert reaches an active company user with `access_control_sync:execute` and opens the attendance device sync-log view. The alert scan runs hourly; the underlying sync history remains the source of detail.

## Mapping recovery and processing

1. Sync an event whose device employee number is intentionally not mapped. Confirm it is retained with `is_employee_mapped=false` and is visible in unmatched attendance review.
2. Add the correct device-to-employee mapping and rerun the same range. Confirm the existing event is updated with the employee ID and returned to pending attendance processing instead of being duplicated.
3. Confirm the attendance processing job completes and the employee's daily summary reflects the test punch.

## Sign-off record

Capture screenshots or response exports for capabilities, first sync, repeated sync, outage recovery, mapping recovery, processing result, and the final daily summary. HR/IT sign off only after the event count, employee, local time, attendance date, and summary all match the device and test schedule.

## Data retention

Raw Hikvision logs are checked daily at 03:00 Dar es Salaam time. Set `ATTENDANCE_RAW_LOG_RETENTION_DAYS` in the deployment secret store only after the data owner approves the period. Purge stays disabled unless `ATTENDANCE_RAW_LOG_RETENTION_PURGE_ENABLED=true` is also configured; with purge disabled, the scheduler only logs the candidate count. Purge only removes processed events, in batches, and leaves pending, failed, unmatched, or exception logs untouched. Review dry-run counts and backup/restore coverage before enabling deletion. The retention period is intentionally unset in the repository.
