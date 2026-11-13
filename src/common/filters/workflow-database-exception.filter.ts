import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import type { Response } from 'express';

const UNIQUE_MESSAGES: Readonly<Record<string, string>> = {
  UQ_daily_activity_employee_date:
    'A daily activity report already exists for this employee and date. Refresh and continue the existing draft.',
  UQ_activity_category_company_code:
    'An activity category already uses this code. Choose another code or edit the existing category.',
};

@Catch(QueryFailedError)
export class WorkflowDatabaseExceptionFilter implements ExceptionFilter<QueryFailedError> {
  private readonly logger = new Logger(WorkflowDatabaseExceptionFilter.name);

  catch(exception: QueryFailedError, host: ArgumentsHost): void {
    const driver: unknown = exception.driverError;
    const record =
      driver && typeof driver === 'object'
        ? (driver as Record<string, unknown>)
        : {};
    const code = typeof record.code === 'string' ? record.code : '';
    const constraint =
      typeof record.constraint === 'string' ? record.constraint : '';
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message =
      'The workflow could not be saved. Please retry; if the problem continues, contact your administrator.';
    if (code === '23505') {
      status = HttpStatus.CONFLICT;
      message =
        UNIQUE_MESSAGES[constraint] ??
        'A record with these unique workflow values already exists. Refresh before retrying or choose different values.';
    } else if (code === '23503') {
      status = HttpStatus.BAD_REQUEST;
      message =
        'A referenced employee or configuration is no longer available. Refresh and select an existing record.';
    } else if (['23514', '23502', '22003', '22P02'].includes(code)) {
      status = HttpStatus.BAD_REQUEST;
      message =
        'The supplied workflow values violate a required field or numeric constraint. Check the highlighted dates, identifiers, and scores.';
    } else if (['40001', '40P01'].includes(code)) {
      status = HttpStatus.CONFLICT;
      message =
        'Another request changed this workflow at the same time. Refresh and retry the step.';
    } else {
      // Never include SQL parameters or database details in client responses or logs.
      this.logger.error(
        `Unexpected workflow database failure (code: ${code || 'unknown'}).`,
      );
    }
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(status)
      .json({
        statusCode: status,
        error:
          status === HttpStatus.CONFLICT
            ? 'Conflict'
            : status === HttpStatus.BAD_REQUEST
              ? 'Bad Request'
              : 'Internal Server Error',
        message,
      });
  }
}
