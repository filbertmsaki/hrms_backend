import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { CorrelatedRequest } from '../middleware/correlation-id.middleware';
import { isDebugModeEnabled } from '../utils/debug-mode.util';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const correlationId = (request as CorrelatedRequest).correlationId ?? null;

    const { status, message, errors, code } = this.extractError(exception);

    if (status >= 500) {
      this.logger.error(
        JSON.stringify({
          event: 'http.request.failed',
          request_id: correlationId,
          method: request.method,
          path: request.url,
          status_code: status,
          error:
            exception instanceof Error ? exception.message : String(exception),
        }),
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    response.status(status).json({
      statusCode: status,
      message,
      ...(errors ? { errors } : {}),
      ...(code ? { code } : {}),
      path: request.url,
      requestId: correlationId,
      timestamp: new Date().toISOString(),
    });
  }

  private extractError(exception: unknown): {
    status: number;
    message: string;
    errors?: Record<string, string[]>;
    code?: string;
  } {
    if (!(exception instanceof HttpException)) {
      const isProduction = process.env.APP_ENV === 'production';
      const showRealError =
        (!isProduction || isDebugModeEnabled()) && exception instanceof Error;
      const message = showRealError
        ? exception.message
        : 'Internal server error';

      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        message,
      };
    }

    const status = exception.getStatus();
    const raw = exception.getResponse();

    // class-validator sends { message: string[], error: string }
    if (
      typeof raw === 'object' &&
      raw !== null &&
      'message' in raw &&
      Array.isArray((raw as { message: unknown }).message)
    ) {
      const messages = (raw as { message: string[] }).message;
      return {
        status,
        message: (raw as { error?: string }).error ?? 'Validation failed',
        errors: { validation: messages },
      };
    }

    // Lets a thrown exception opt into a stable, machine-readable `code`
    // (e.g. new UnauthorizedException({ message, code: 'SESSION_REPLACED' }))
    // that a client can key off without parsing the human-readable message.
    const code =
      typeof raw === 'object' &&
      raw !== null &&
      'code' in raw &&
      typeof (raw as { code: unknown }).code === 'string'
        ? (raw as { code: string }).code
        : undefined;

    const message =
      typeof raw === 'string'
        ? raw
        : typeof raw === 'object' && raw !== null && 'message' in raw
          ? String((raw as { message: unknown }).message)
          : exception.message;

    return { status, message, code };
  }
}
