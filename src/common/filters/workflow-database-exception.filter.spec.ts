import { ArgumentsHost } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { WorkflowDatabaseExceptionFilter } from './workflow-database-exception.filter';

describe('workflow database exception boundary', () => {
  it.each([
    [
      '23505',
      'UQ_daily_activity_employee_date',
      409,
      'continue the existing draft',
    ],
    [
      '23505',
      'UQ_performance_period_year_type_sequence',
      409,
      'type and sequence',
    ],
    ['23503', 'fk_unknown', 400, 'no longer available'],
    ['40001', '', 409, 'changed this workflow'],
  ])(
    'maps %s into an actionable response without SQL detail',
    (code, constraint, statusCode, message) => {
      const response = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const host = {
        switchToHttp: () => ({ getResponse: () => response }),
      } as unknown as ArgumentsHost;
      const driver = Object.assign(new Error('secret employee identifier'), {
        code,
        constraint,
        detail: 'secret parameter',
      });
      const failure = new QueryFailedError(
        'INSERT confidential SQL',
        ['secret'],
        driver,
      );
      new WorkflowDatabaseExceptionFilter().catch(failure, host);
      expect(response.status).toHaveBeenCalledWith(statusCode);
      expect(response.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode,
          message: expect.stringContaining(message),
        }),
      );
      expect(JSON.stringify(response.json.mock.calls)).not.toContain('secret');
      expect(JSON.stringify(response.json.mock.calls)).not.toContain(
        'confidential SQL',
      );
    },
  );
});
