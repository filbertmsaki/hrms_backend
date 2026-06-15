# Alliance Attendance Shift Module Study

## Scope Reviewed

- `src/modules/hr/attendance/attendance.module.ts`
- `src/modules/hr/attendance/shift/shift-engine.module.ts`
- Shift submodules:
  - `shifts`
  - `shift-breaks`
  - `shift-attendance-rules`
  - `shift-overtime-rules`
  - `shift-assignments`
  - `shift-rotation-groups`
  - `shift-rotation-rules`
  - `shift-schedules`
- Related attendance modules:
  - `policies`
  - `settings`
  - `checkpoints`
  - `geofences`
  - `wifi-networks`
  - `mobile-punches`
  - `processing`
  - `timetable`
- Related migrations:
  - `1780384036110-Migration.ts`
  - `1780384036116-StrengthenAttendanceSchedulingFoundation.ts`
  - `1785420300001-CreateAttendanceGeofencesTable.ts`
  - `1785420300002-CreateAttendanceWifiNetworksTable.ts`
  - `1785420300003-CreateAttendanceMobilePunchesTable.ts`
  - `1785420300004-UnifyLeaveAndAttendanceHolidays.ts`

## Module Structure

### Core shift entities

- `Shift`
  - Master definition of a work shift.
  - Holds time window, grace periods, late threshold, overtime flags, checkout requirement, and company/branch/department scope.
- `ShiftBreak`
  - Break rows attached to one shift.
- `ShiftAttendanceRule`
  - One attendance behavior rule per shift.
  - Unique by `shift_id`.
- `ShiftOvertimeRule`
  - One overtime rule per shift.
  - Unique by `shift_id`.
- `ShiftAssignment`
  - Employee-to-shift assignment effective for a date range.
  - Optional `rotation_group_id`.
- `ShiftRotationGroup`
  - Defines a cycle length in days.
- `ShiftRotationRule`
  - Defines what happens on a cycle day.
  - Can point to a shift or mark an off day.
- `ShiftSchedule`
  - Explicit employee/date override schedule.
  - Strongest schedule source in processing.

### Related attendance entities

- `AttendancePolicy`
  - Company-level attendance behavior and punch validation defaults.
- `AttendanceSetting`
  - Company-level overtime defaults.
- `AttendanceCheckpoint`
  - Policy-linked validation requirements for device, GPS, WiFi, QR, or manual contexts.
- `AttendanceGeofence`
  - Company or branch geofence for GPS validation.
- `AttendanceWifiNetwork`
  - Company or branch WiFi validation target.
- `AttendanceMobilePunch`
  - Mobile check-in/check-out record with validation outcome.
- `AttendanceHoliday` and `HolidayGroup`
  - Holidays used during schedule resolution and daily summary calculation.
- `Timetable`, `TimetableDay`, `EmployeeTimetable`, `TimetableGeneratedSchedule`
  - Day-of-week scheduling layer and optional generated schedule source.

## DTO and Validation Summary

### Create shift DTO

`CreateShiftDto` expects:

- Optional numeric `branch_id`
- Optional numeric `department_id`
- Required `name`
- Required `code`
- Optional `description`
- Required enum `shift_type`
  - `FIXED`
  - `FLEXIBLE`
  - `ROTATIONAL`
- Required `start_time`
- Required `end_time`
- Required integer `expected_work_minutes`
- Required integer `minimum_work_minutes`
- Required integer `half_day_minutes`
- Optional integer `grace_in_minutes`
- Optional integer `grace_out_minutes`
- Optional integer `late_after_minutes`
- Optional integer `early_leave_after_minutes`
- Optional booleans:
  - `is_night_shift`
  - `crosses_midnight`
  - `allow_overtime`
  - `requires_checkout`
  - `allow_early_checkin`
  - `allow_late_checkout`
- Optional integer `max_overtime_minutes`
- Optional enum `status`
  - `ACTIVE`
  - `INACTIVE`

### Validation behavior confirmed

- Numeric minimum checks are present for IDs and minute fields.
- Enum checks are present for `shift_type` and `status`.
- `branch_id` and `department_id` are company-scoped again in service logic.
- Name/code duplicates are blocked in service logic per company.
- Time fields are only validated as strings with max length 8.
  - Current DTO does **not** enforce `HH:MM[:SS]` format.
  - Example invalid values like `8:15` currently pass DTO validation.

## Service Logic Summary

### `ShiftsService`

- Validates that `branch_id` belongs to the active company.
- Validates that `department_id` belongs to the active company.
- Trims `name`, `code`, and `description`.
- Blocks duplicate `code` per company.
- Blocks duplicate `name` per company.
- Soft deletes shifts.

### `ShiftBreaksService`

- Ensures `shift_id` belongs to the active company.
- Blocks duplicate break `name` within a shift.

### `ShiftAttendanceRulesService`

- Ensures `shift_id` belongs to the active company.
- Allows only one attendance rule row per shift.

### `ShiftOvertimeRulesService`

- Ensures `shift_id` belongs to the active company.
- Allows only one overtime rule row per shift.

### `ShiftAssignmentsService`

- Ensures employee belongs to active company.
- Ensures shift belongs to active company.
- Ensures optional rotation group belongs to active company.
- Validates `effective_to >= effective_from`.
- Prevents overlapping active assignments for the same employee.

### `ShiftRotationRulesService`

- Ensures rotation group belongs to active company.
- Ensures optional shift belongs to active company.
- Requires `shift_id` unless `is_off_day = true`.
- Allows one rule per `rotation_group_id + day_index`.

### `ShiftSchedulesService`

- Ensures employee belongs to active company.
- Ensures `shift_id`, optional `override_shift_id`, and optional `holiday_id` belong to active company.
- Allows one schedule per employee per date.
- Best current tool for manual department-aware Saturday rest planning.

## Controller Endpoints

### Shift endpoints

- `POST /shift/shifts`
- `GET /shift/shifts`
- `GET /shift/shifts/:id`
- `PATCH /shift/shifts/:id`
- `DELETE /shift/shifts/:id`

### Supporting shift endpoints

- `POST /shift/shift-breaks`
- `POST /shift/shift-attendance-rules`
- `POST /shift/shift-overtime-rules`
- `POST /shift/shift-assignments`
- `POST /shift/shift-rotation-groups`
- `POST /shift/shift-rotation-rules`
- `POST /shift/shift-schedules`

Each of the above also exposes standard list/get/update/delete endpoints.

### Related attendance endpoints

- `POST /attendance/policies`
- `POST /attendance/settings`
- `POST /attendance/checkpoints`
- `POST /attendance/geofences`
- `POST /attendance/wifi-networks`
- `POST /attendance/mobile-punches/check-in`
- `POST /attendance/mobile-punches/check-out`

### Related timetable endpoints

- `POST /timetable/timetables`
- `POST /timetable/timetable-days`
- `POST /timetable/employee-timetables`
- `POST /timetable/timetable-attendance-rules`
- `POST /timetable/timetable-generated-schedules`
- `POST /timetable/timetable-rotations`
- `POST /timetable/timetable-rotation-rules`
- `POST /timetable/timetable-shift-rules`
- `POST /timetable/timetable-holiday-rules`

## Repository Usage Pattern

The attendance shift module mostly uses TypeORM `Repository<T>` directly.

- Simple ownership checks use `findOne`.
- Filtered lists use query builders.
- Cross-company ownership checks often use joins:
  - employee -> company_user
  - attendance rule -> shift
  - rotation rule -> rotation group
- Soft delete is used for `Shift`.
- Hard delete is used for many child records like breaks/rules/schedules.

Only a few related modules wrap repositories:

- `AttendanceGeofenceRepository`
- `AttendanceWifiNetworkRepository`
- `AttendanceMobilePunchRepository`

## Scheduling Resolution Order

`AttendanceScheduleResolverService.resolveForDate()` resolves schedule in this order:

1. `shift_schedules`
2. `shift_assignments`
3. existing `timetable_generated_schedules`
4. generate timetable schedule on demand, then read it
5. direct `employee_timetables` timetable definition
6. fallback `NONE`

Implication:

- Manual `shift_schedules` overrides win.
- `shift_assignments` beat timetable-generated schedules.
- Timetable is better for recurring weekday structure.
- `shift_schedules` is better for monthly exceptions like employee-specific Saturday rests.

## Relationships to Other Attendance Modules

### Policies and settings

- Global config is assembled from:
  - `AttendancePolicy`
  - `AttendanceSetting`
- Resolver uses policy values for:
  - late
  - half day
  - absent
  - grace in
  - auto absent
  - weekend auto-off
- Resolver uses setting values for:
  - overtime start after
  - max overtime

### Checkpoints, geofences, WiFi, mobile punches

- Mobile punch validation depends on:
  - active policy
  - required checkpoints
  - selected geofence
  - selected WiFi network
- `AttendancePolicy.authentication_modes` can block mobile punch creation.
- `AttendancePolicy.require_geo_fencing` can force GPS validation.
- Required checkpoints can force:
  - geofence selection
  - WiFi selection
  - and can reject unsupported mobile punch contexts like device-only checkpoints.

### Timetables and schedules

- `TimetableDay` maps day-of-week to work/off and optional default shift.
- `EmployeeTimetable` assigns a timetable to an employee by date range.
- `TimetableGeneratedSchedule` stores generated day results.
- `ShiftSchedule` is still the strongest override source.

## Recommendation for Alliance Working Setup

### Safe current setup

Use:

1. `shifts`
   - Define reusable shift templates:
     - Monday-Friday regular
     - Saturday half day
     - Sunday off or generic off shift
2. `shift-breaks`
   - Attach lunch break to weekday shift.
3. `shift-attendance-rules`
   - Per shift thresholds.
4. `shift-overtime-rules`
   - Per shift overtime behavior.
5. `attendance/policies`
   - Set `weekend_days` to `SUN`, not `SAT,SUN`, because Saturday is a real workday.
6. `timetable/timetable-days`
   - Monday-Friday -> weekday shift
   - Saturday -> half-day shift
   - Sunday -> off
7. `timetable/employee-timetables`
   - Assign recurring weekly structure per employee.
8. `shift/shift-schedules`
   - Use date-specific off-day records for each employee’s one Saturday rest per month.

### Why not use only shift rotation?

Current rotation support is cycle-day based, not:

- monthly
- department-aware
- minimum-coverage aware

It can rotate off days, but it cannot by itself guarantee:

- one Saturday off per month
- within each department
- while always leaving at least one employee present

## Best Module for Saturday Monthly Rest

### Recommended today

Use `shift_schedules` on specific Saturday dates.

Reason:

- employee/date level
- strongest precedence in resolver
- fits exception planning
- easiest way to keep at least one employee present in the department

### Optional recurring base

Use a timetable for the normal pattern:

- Monday-Friday regular
- Saturday half day
- Sunday off

Then apply `shift_schedules` only for the monthly Saturday rest exceptions.

## Minimum Safe Changes Suggested

### 1. Strengthen shift time validation

Add regex validation to `CreateShiftDto.start_time` and `CreateShiftDto.end_time`.

Reason:

- current DTO accepts malformed values like `8:15`

### 2. Add consistency validation for off-day-like shifts

If you choose to keep “off shifts” as real shifts, consider service validation that:

- `expected_work_minutes = 0`
- `minimum_work_minutes = 0`
- `requires_checkout = false`

This is optional, because the cleaner model is to use timetable days or shift schedules for off days.

### 3. Add department coverage validation for Saturday off scheduling

The real missing feature for your business rule is not a shift DTO field.
It is scheduling validation that checks, before saving a Saturday off schedule:

- department
- branch
- date
- remaining active scheduled employees

This should live in a scheduling/planning service, not in `CreateShiftDto`.

## Verification Completed

- Build passed: `npm run build`
- Migrations are applied and visible: `npm run migration:show`
- DTO validation tested with proposed create-shift payloads
- Service create flow tested with mock repositories

Observed validation gap:

- invalid time text still passes `CreateShiftDto`
