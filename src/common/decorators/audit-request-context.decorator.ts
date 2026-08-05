import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import type { Request } from 'express';
import { AuditRequestContext } from '../interfaces/audit-request-context.interface';

export const CurrentAuditContext = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuditRequestContext => {
    const request = context.switchToHttp().getRequest<Request>();
    const requestIdHeader = request.headers['x-request-id'];
    const userAgentHeader = request.headers['user-agent'];

    return {
      ipAddress: request.ip || request.socket?.remoteAddress || null,
      userAgent:
        typeof userAgentHeader === 'string'
          ? userAgentHeader.slice(0, 2000)
          : null,
      requestId:
        typeof requestIdHeader === 'string'
          ? requestIdHeader.slice(0, 100)
          : null,
    };
  },
);
