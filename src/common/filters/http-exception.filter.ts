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

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const correlationId = (request as CorrelatedRequest).correlationId ?? null;

    const { status, message, errors } = this.extractError(exception);

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
      path: request.url,
      requestId: correlationId,
      timestamp: new Date().toISOString(),
    });
  }

  private extractError(exception: unknown): {
    status: number;
    message: string;
    errors?: Record<string, string[]>;
  } {
    if (!(exception instanceof HttpException)) {
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Internal server error',
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

    const message =
      typeof raw === 'string'
        ? raw
        : typeof raw === 'object' && raw !== null && 'message' in raw
          ? String((raw as { message: unknown }).message)
          : exception.message;

    return { status, message };
  }
}
