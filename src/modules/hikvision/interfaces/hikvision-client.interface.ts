export interface HikvisionConnectionCredentials {
  ipAddress: string;
  port: number;
  protocol: string;
  username: string;
  password: string;
}

export interface HikvisionRequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
  logOptions?: {
    commandType?: string;
    correlationId?: string;
    createdByCompanyUserId?: number | null;
  };
}

export interface HikvisionHttpResponse {
  status: number;
  ok: boolean;
  body: string;
}
