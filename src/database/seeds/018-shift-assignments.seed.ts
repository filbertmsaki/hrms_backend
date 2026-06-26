import { DataSource } from 'typeorm';
import { Seeder, SeederFactoryManager } from 'typeorm-extension';

// Alliance Company uses a timetable-based schedule (017-timetables.seed.ts).
//
// WHY this seeder is intentionally empty:
//
// The attendance schedule resolver checks sources in this priority order:
//   1. ShiftSchedule (manual override)
//   2. ShiftAssignment  ← if any row exists here, the resolver stops and uses it
//   3. Employee Timetable
//   4. Company Default Timetable  ← this is where Alliance schedule lives
//
// Seeding direct ShiftAssignment rows would cause EVERY day (including Saturday
// and Sunday) to resolve to SHIFT-DAY (08:15–17:15), bypassing the timetable
// entirely.  The timetable is the correct authority for Alliance because it
// defines per-day shifts:
//   Mon–Fri  → SHIFT-DAY  (08:15–17:15)
//   Saturday → SHIFT-SAT  (09:00–13:00)
//   Sunday   → off day
//
// If you need to assign employees to a rotation or a one-off override, create
// ShiftSchedule records (source priority 1) or employee-specific timetable
// assignments (EmployeeTimetable) instead of bulk ShiftAssignment rows.
//
// If ShiftAssignment rows from a previous seed run still exist in the database,
// run the following SQL to clear them before re-seeding:
//   DELETE FROM shift_assignments WHERE company_id = <company_id>;

export default class ShiftAssignmentsSeeder implements Seeder {
  public async run(
    _dataSource: DataSource,
    _factoryManager: SeederFactoryManager,
  ): Promise<void> {
    console.log(
      '[Seeder][ShiftAssignments] Skipped — Alliance Company uses timetable-based scheduling. ' +
      'See 017-timetables.seed.ts.',
    );
  }
}
