import { plainToInstance } from 'class-transformer';
import { QueryAttendanceDailySummariesDto } from './dtos/query-attendance-daily-summaries.dto';
import { normalizeAttendanceSummaryQuery } from './attendance-summary-query.util';

describe('attendance summary report filters', () => {
  it('normalizes late, early and overtime filters for shared list/export queries', () => {
    const dto = plainToInstance(QueryAttendanceDailySummariesDto, {
      late_only: 'true',
      early_departure_only: 'true',
      overtime_only: 'false',
    });

    expect(normalizeAttendanceSummaryQuery(dto)).toMatchObject({
      lateOnly: true,
      earlyDepartureOnly: true,
      overtimeOnly: false,
    });
  });

  it('does not turn invalid filter values into a valid false filter', () => {
    const dto = plainToInstance(QueryAttendanceDailySummariesDto, {
      late_only: 'sometimes',
    });

    expect(dto.late_only).toBe('sometimes');
  });
});
