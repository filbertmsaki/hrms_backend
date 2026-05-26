import { ConfigService } from '@nestjs/config';

export type HikvisionConfig = {
  requestTimeoutMs: number;
  streamRequestTimeoutMs: number;
  reconnectBaseDelayMs: number;
  reconnectMaxDelayMs: number;
  defaultProtocol: string;
  defaultPort: number;
  defaultUsername: string;
  defaultPassword: string;
  syncPageSize: number;
};

export const buildHikvisionConfig = (configService: ConfigService): HikvisionConfig => ({
  requestTimeoutMs: Number(configService.get<string>('HIKVISION_REQUEST_TIMEOUT_MS') ?? 15000),
  streamRequestTimeoutMs: Number(
    configService.get<string>('HIKVISION_STREAM_REQUEST_TIMEOUT_MS') ?? 0,
  ),
  reconnectBaseDelayMs: Number(configService.get<string>('HIKVISION_RECONNECT_BASE_MS') ?? 3000),
  reconnectMaxDelayMs: Number(configService.get<string>('HIKVISION_RECONNECT_MAX_MS') ?? 30000),
  defaultProtocol: configService.get<string>('HIKVISION_DEFAULT_PROTOCOL') ?? 'http',
  defaultPort: Number(configService.get<string>('HIKVISION_DEFAULT_PORT') ?? 80),
  defaultUsername: configService.get<string>('HIKVISION_DEFAULT_USERNAME') ?? '',
  defaultPassword: configService.get<string>('HIKVISION_DEFAULT_PASSWORD') ?? '',
  syncPageSize: Number(configService.get<string>('HIKVISION_SYNC_PAGE_SIZE') ?? 100),
});
