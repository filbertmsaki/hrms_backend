import { AsyncLocalStorage } from 'async_hooks';
import type { Request } from 'express';
import { AuditRequestContext } from '../interfaces/audit-request-context.interface';

type RequestContextStore = {
  request: Request & { correlationId?: string };
};

const requestContextStorage = new AsyncLocalStorage<RequestContextStore>();

export const EMPTY_REQUEST_AUDIT_CONTEXT: AuditRequestContext = Object.freeze({
  ipAddress: null,
  userAgent: null,
  requestId: null,
});

export function runWithRequestContext<T>(
  request: Request & { correlationId?: string },
  callback: () => T,
): T {
  return requestContextStorage.run({ request }, callback);
}

/**
 * Audit metadata (client IP, user agent and request id) for the HTTP request
 * currently being handled. Outside a request (cron jobs, queue workers,
 * migrations) every field is null.
 */
export function getRequestAuditContext(): AuditRequestContext {
  const request = requestContextStorage.getStore()?.request;
  if (!request) {
    return EMPTY_REQUEST_AUDIT_CONTEXT;
  }

  const userAgentHeader = request.headers['user-agent'];
  const requestIdHeader = request.headers['x-request-id'];
  const requestId =
    request.correlationId ??
    (typeof requestIdHeader === 'string' ? requestIdHeader : null);

  return {
    ipAddress: request.ip || request.socket?.remoteAddress || null,
    userAgent:
      typeof userAgentHeader === 'string'
        ? userAgentHeader.slice(0, 2000)
        : null,
    requestId: requestId ? requestId.slice(0, 100) : null,
  };
}

/**
 * Prefers an explicitly supplied context (e.g. from @CurrentAuditContext) and
 * falls back to the ambient request context field by field.
 */
export function resolveAuditContext(
  explicit?: Partial<AuditRequestContext> | null,
): AuditRequestContext {
  const ambient = getRequestAuditContext();
  return {
    ipAddress: explicit?.ipAddress ?? ambient.ipAddress,
    userAgent: explicit?.userAgent ?? ambient.userAgent,
    requestId: explicit?.requestId ?? ambient.requestId,
  };
}
