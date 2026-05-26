import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { buildHikvisionConfig } from './hikvision.config';
import { AttendanceDevice } from '../devices/entities/attendance-device.entity';
import { HikvisionParserHelper } from './helpers/hikvision-parser.helper';
import { HikvisionAuthService } from './hikvision-auth.service';
import { HikvisionListenerSession, HikvisionStreamEventHandler } from './interfaces/alert-stream.interface';

@Injectable()
export class HikvisionListener implements OnModuleDestroy {
  private readonly logger = new Logger(HikvisionListener.name);
  private readonly sessions = new Map<number, HikvisionListenerSession>();

  constructor(
    private readonly configService: ConfigService,
    private readonly authService: HikvisionAuthService,
    private readonly parserHelper: HikvisionParserHelper,
  ) {}

  async start(device: AttendanceDevice, eventHandler: HikvisionStreamEventHandler): Promise<void> {
    if (this.sessions.has(device.id)) {
      return;
    }

    const session: HikvisionListenerSession = {
      deviceId: device.id,
      stopRequested: false,
      reconnectAttempts: 0,
      abortController: new AbortController(),
      reconnectTimeout: null,
    };
    this.sessions.set(device.id, session);
    void this.runSession(device, session, eventHandler);
  }

  async stop(deviceId: number): Promise<void> {
    const session = this.sessions.get(deviceId);
    if (!session) {
      return;
    }

    session.stopRequested = true;
    if (session.reconnectTimeout) {
      clearTimeout(session.reconnectTimeout);
      session.reconnectTimeout = null;
    }

    session.abortController.abort();
    this.sessions.delete(deviceId);
    this.logger.log(`Hikvision stream disconnected for device ${deviceId}`);
  }

  isRunning(deviceId: number): boolean {
    return this.sessions.has(deviceId);
  }

  async onModuleDestroy(): Promise<void> {
    const ids = Array.from(this.sessions.keys());
    for (const deviceId of ids) {
      await this.stop(deviceId);
    }
  }

  private async runSession(
    device: AttendanceDevice,
    session: HikvisionListenerSession,
    eventHandler: HikvisionStreamEventHandler,
  ): Promise<void> {
    const config = buildHikvisionConfig(this.configService);
    const decoder = new TextDecoder();

    while (!session.stopRequested) {
      try {
        const response = await this.authService.request(
          device,
          '/ISAPI/Event/notification/alertStream',
          {
            method: 'GET',
            headers: {
              Accept: 'application/json, application/xml, text/plain, */*',
              Connection: 'keep-alive',
            },
            timeoutMs: config.streamRequestTimeoutMs,
            signal: session.abortController.signal,
          },
        );

        if (!response.ok) {
          throw new Error(`Hikvision stream request failed with status ${response.status}`);
        }

        if (!response.body) {
          throw new Error('Hikvision stream opened without response body');
        }

        this.logger.log(`Hikvision stream connected for device ${device.id}`);

        session.reconnectAttempts = 0;
        const reader = response.body.getReader();
        let buffer = '';

        while (!session.stopRequested) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }

          if (!value) {
            continue;
          }

          buffer += decoder.decode(value, { stream: true });
          const { messages, remainder } = this.parserHelper.extractMessagesFromStreamBuffer(buffer);
          buffer = remainder;

          for (const message of messages) {
            try {
              const payload = this.parserHelper.parsePayload(message);
              const events = this.parserHelper.extractAlertEvents(payload);
              for (const event of events) {
                await eventHandler(event);
              }
            } catch (error) {
              this.logger.warn(
                `Skipped malformed alert stream payload on device ${device.id}: ${(error as Error).message}`,
              );
            }
          }
        }

        this.logger.warn(`Hikvision stream interrupted for device ${device.id}`);
      } catch (error) {
        if (session.stopRequested) {
          break;
        }

        session.reconnectAttempts += 1;
        const delay = Math.min(
          config.reconnectBaseDelayMs * 2 ** (session.reconnectAttempts - 1),
          config.reconnectMaxDelayMs,
        );

        this.logger.warn(
          `Hikvision stream reconnect scheduled for device ${device.id} in ${delay}ms: ${(error as Error).message}`,
        );

        await this.wait(delay, session);
      }
    }
  }

  private wait(delayMs: number, session: HikvisionListenerSession): Promise<void> {
    return new Promise((resolve) => {
      session.reconnectTimeout = setTimeout(() => {
        session.reconnectTimeout = null;
        resolve();
      }, delayMs);
    });
  }
}
