import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { runWithRequestContext } from '../request-context/request-context';

export interface CorrelatedRequest extends Request {
  correlationId?: string;
}

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(
    request: CorrelatedRequest,
    response: Response,
    next: NextFunction,
  ): void {
    const incoming = request.headers['x-request-id'];

    const correlationId =
      typeof incoming === 'string' &&
      incoming.length >= 8 &&
      incoming.length <= 100
        ? incoming
        : randomUUID();

    request.correlationId = correlationId;
    response.setHeader('X-Request-Id', correlationId);

    runWithRequestContext(request, () => next());
  }
}
