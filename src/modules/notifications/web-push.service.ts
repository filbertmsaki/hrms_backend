import { createHash } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as webPush from 'web-push';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import {
  DeleteWebPushSubscriptionDto,
  WebPushSubscriptionDto,
} from './dto/web-push-subscription.dto';
import { AppNotification } from './entities/app-notification.entity';
import { WebPushSubscription } from './entities/web-push-subscription.entity';

function endpointHash(endpoint: string): string {
  return createHash('sha256').update(endpoint).digest('hex');
}

// The push service sends server-side HTTP requests. Limit subscription endpoints
// to browser push providers so a user cannot register an internal network URL.
function isBrowserPushEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    const host = url.hostname.toLowerCase();
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.port &&
      (host === 'fcm.googleapis.com' ||
        host === 'web.push.apple.com' ||
        host === 'updates.push.services.mozilla.com' ||
        host.endsWith('.notify.windows.com'))
    );
  } catch {
    return false;
  }
}

@Injectable()
export class WebPushService {
  private readonly logger = new Logger(WebPushService.name);

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(WebPushSubscription)
    private readonly subscriptions: Repository<WebPushSubscription>,
  ) {}

  getConfig() {
    const publicKey =
      this.config.get<string>('WEB_PUSH_VAPID_PUBLIC_KEY')?.trim() ?? '';
    const privateKey =
      this.config.get<string>('WEB_PUSH_VAPID_PRIVATE_KEY')?.trim() ?? '';
    const subject = this.config.get<string>('WEB_PUSH_SUBJECT')?.trim() ?? '';
    return {
      enabled: Boolean(
        publicKey && privateKey && /^(mailto:|https:)/.test(subject),
      ),
      publicKey: publicKey || null,
    };
  }

  async register(actor: AuthenticatedUser, input: WebPushSubscriptionDto) {
    const { companyId, companyUserId } = this.actorScope(actor);
    if (!this.getConfig().enabled) {
      throw new ServiceUnavailableException(
        'Browser notifications are not configured.',
      );
    }
    if (!isBrowserPushEndpoint(input.endpoint)) {
      throw new BadRequestException('Unsupported browser push endpoint.');
    }
    await this.subscriptions.upsert(
      {
        companyId,
        companyUserId,
        endpoint: input.endpoint,
        endpointHash: endpointHash(input.endpoint),
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
        isActive: true,
      },
      { conflictPaths: ['endpointHash'] },
    );
    return { registered: true };
  }

  async unregister(
    actor: AuthenticatedUser,
    input: DeleteWebPushSubscriptionDto,
  ) {
    const { companyId, companyUserId } = this.actorScope(actor);
    await this.subscriptions.update(
      { companyId, companyUserId, endpointHash: endpointHash(input.endpoint) },
      { isActive: false },
    );
    return { registered: false };
  }

  async sendToNotification(notification: AppNotification): Promise<void> {
    const config = this.getConfig();
    if (!config.enabled || !config.publicKey) return;
    const privateKey = this.config
      .getOrThrow<string>('WEB_PUSH_VAPID_PRIVATE_KEY')
      .trim();
    const subject = this.config.getOrThrow<string>('WEB_PUSH_SUBJECT').trim();
    const subscriptions = await this.subscriptions.find({
      where: {
        companyId: notification.company_id,
        companyUserId: notification.receiver_company_user_id,
        isActive: true,
      },
      take: 100,
    });
    if (!subscriptions.length) return;

    const payload = JSON.stringify({
      id: notification.id,
      title: notification.title,
      body: notification.message,
      actionUrl: notification.action_url,
    });
    await Promise.all(
      subscriptions.map(async (subscription) => {
        try {
          await webPush.sendNotification(
            {
              endpoint: subscription.endpoint,
              keys: { p256dh: subscription.p256dh, auth: subscription.auth },
            },
            payload,
            {
              vapidDetails: {
                subject,
                publicKey: config.publicKey!,
                privateKey,
              },
              TTL: 60 * 60 * 24,
              urgency: 'normal',
              timeout: 10_000,
            },
          );
        } catch (error) {
          const statusCode = (error as { statusCode?: number }).statusCode;
          if (statusCode === 404 || statusCode === 410) {
            await this.subscriptions.update(subscription.id, {
              isActive: false,
            });
          } else {
            this.logger.warn(
              `Browser push delivery failed (status ${statusCode ?? 'unknown'}).`,
            );
          }
        }
      }),
    );
  }

  private actorScope(actor: AuthenticatedUser) {
    const companyId = actor.companyId;
    const companyUserId = actor.companyMembershipId;
    if (!companyId || !companyUserId) {
      throw new BadRequestException(
        'Select an active company to use browser notifications.',
      );
    }
    return { companyId, companyUserId };
  }
}
