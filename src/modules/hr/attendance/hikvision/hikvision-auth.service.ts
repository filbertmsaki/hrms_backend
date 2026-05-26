import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import DigestFetch from 'digest-fetch';
import { buildHikvisionConfig } from './hikvision.config';
import { AttendanceDevice } from '../devices/entities/attendance-device.entity';
import { buildDeviceUrl } from './helpers/hikvision-request.helper';

type HikvisionRequestOptions = {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
};

@Injectable()
export class HikvisionAuthService {
  constructor(private readonly configService: ConfigService) {}

  async request(
    device: Pick<AttendanceDevice, 'ipAddress' | 'port' | 'apiUsername' | 'apiPassword'>,
    path: string,
    options: HikvisionRequestOptions = {},
  ): Promise<Response> {
    const config = buildHikvisionConfig(this.configService);
    const credentials = this.resolveCredentials(device);
    const client = new DigestFetch(credentials.username, credentials.password);
    const timeoutMs = options.timeoutMs ?? config.requestTimeoutMs;

    const timeoutController = new AbortController();
    const timeoutHandle = timeoutMs > 0
      ? setTimeout(() => timeoutController.abort(), timeoutMs)
      : null;

    try {
      const response = await client.fetch(buildDeviceUrl(device, path), {
        method: options.method ?? 'GET',
        headers: options.headers,
        body: options.body,
        signal: this.combineSignals(options.signal, timeoutController.signal),
      });

      if (response.status === 401) {
        throw new UnauthorizedException('Hikvision digest authentication failed (401)');
      }

      return response;
    } catch (error) {
      const code = (error as { code?: string } | null)?.code;
      const message = (error as Error).message?.toLowerCase?.() ?? '';

      if (timeoutController.signal.aborted || code === 'ECONNABORTED' || message.includes('timeout')) {
        throw new ServiceUnavailableException('Hikvision request timeout');
      }

      if (code === 'ECONNRESET' || message.includes('connection reset')) {
        throw new ServiceUnavailableException('Hikvision connection reset');
      }

      if (code === 'ENOTFOUND' || code === 'EHOSTUNREACH' || code === 'ECONNREFUSED') {
        throw new ServiceUnavailableException('Hikvision device is offline or unreachable');
      }

      throw error;
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
    }
  }

  private resolveCredentials(
    device: Pick<AttendanceDevice, 'apiUsername' | 'apiPassword'>,
  ): { username: string; password: string } {
    const config = buildHikvisionConfig(this.configService);
    const username = device.apiUsername || config.defaultUsername;
    const password = device.apiPassword || config.defaultPassword;

    if (!username || !password) {
      throw new UnauthorizedException('Missing Hikvision device credentials');
    }

    return { username, password };
  }

  private combineSignals(signalA?: AbortSignal, signalB?: AbortSignal): AbortSignal | undefined {
    if (signalA && signalB) {
      if (typeof AbortSignal.any === 'function') {
        return AbortSignal.any([signalA, signalB]);
      }

      const merged = new AbortController();
      const abort = () => merged.abort();
      signalA.addEventListener('abort', abort, { once: true });
      signalB.addEventListener('abort', abort, { once: true });
      return merged.signal;
    }
    return signalA ?? signalB;
  }
}
