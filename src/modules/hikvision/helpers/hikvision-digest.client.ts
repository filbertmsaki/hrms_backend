import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import DigestFetch from 'digest-fetch';
import {
  HikvisionConnectionCredentials,
  HikvisionHttpResponse,
  HikvisionRequestOptions,
} from '../interfaces/hikvision-client.interface';

@Injectable()
export class HikvisionDigestClient {
  constructor(private readonly configService: ConfigService) {}

  async request(
    credentials: HikvisionConnectionCredentials,
    path: string,
    options: HikvisionRequestOptions = {},
  ): Promise<HikvisionHttpResponse> {
    const timeoutMs =
      options.timeoutMs ??
      Number(this.configService.get<string>('HIKVISION_REQUEST_TIMEOUT_MS') ?? 15000);
    const client = new DigestFetch(credentials.username, credentials.password);

    const timeoutController = new AbortController();
    const timeoutHandle =
      timeoutMs > 0 ? setTimeout(() => timeoutController.abort(), timeoutMs) : null;

    try {
      const response = await client.fetch(this.buildUrl(credentials, path), {
        method: options.method ?? 'GET',
        headers: options.headers,
        body: options.body,
        signal: this.combineSignals(options.signal, timeoutController.signal),
      });

      const body = await response.text();
      if (response.status === 401) {
        throw new UnauthorizedException('Hikvision digest authentication failed (401)');
      }

      return {
        status: response.status,
        ok: response.ok,
        body,
      };
    } catch (error) {
      const code = (error as { code?: string } | null)?.code;
      const message = (error as Error).message?.toLowerCase?.() ?? '';

      if (
        timeoutController.signal.aborted ||
        code === 'ECONNABORTED' ||
        message.includes('timeout')
      ) {
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

  private buildUrl(credentials: HikvisionConnectionCredentials, path: string): string {
    const safePath = path.startsWith('/') ? path : `/${path}`;
    const protocol = (credentials.protocol || 'http').toLowerCase();
    const isDefaultPort =
      (protocol === 'http' && credentials.port === 80) ||
      (protocol === 'https' && credentials.port === 443);
    const portSegment = isDefaultPort ? '' : `:${credentials.port}`;
    return `${protocol}://${credentials.ipAddress}${portSegment}${safePath}`;
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
