import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import type { StringValue } from 'ms';
import { PostgresAdvisoryLockService } from '../../common/database/postgres-advisory-lock.service';
import { TokenBlacklistModule } from '../auth/token-blacklist.module';
import { CompanyUser } from '../companies/entities/company-user.entity';
import { MailModule } from '../mail/mail.module';
import { SmsModule } from '../sms/sms.module';
import { User } from '../users/entities/user.entity';
import { AppNotification } from './entities/app-notification.entity';
import { NotificationDelivery } from './entities/notification-delivery.entity';
import { NotificationChannelGlobalSetting } from './entities/notification-channel-global-setting.entity';
import { NotificationChannelRegistry } from './entities/notification-channel-registry.entity';
import { NotificationMailLog } from './entities/notification-mail-log.entity';
import { NotificationOutboxEvent } from './entities/notification-outbox-event.entity';
import { NotificationPreference } from './entities/notification-preference.entity';
import { NotificationRule } from './entities/notification-rule.entity';
import { NotificationTemplate } from './entities/notification-template.entity';
import { NotificationConfigurationService } from './notification-configuration.service';
import { NotificationDeliveryDispatcherService } from './notification-delivery-dispatcher.service';
import { NotificationProcessor } from './notification.processor';
import { NotificationQueueService } from './notification-queue.service';
import { NotificationQueuedTaskRunnerService } from './notification-queued-task-runner.service';
import { NOTIFICATION_QUEUE } from './notification-job.constants';
import { NotificationOrchestratorService } from './notification-orchestrator.service';
import { NotificationChannelManagementService } from './notification-channel-management.service';
import { NotificationPreferencesService } from './notification-preferences.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsGateway } from './notifications.gateway';
import { NotificationsService } from './notifications.service';
import { ConditionalBullModule } from '../../infrastructure/queues/conditional-bull.module';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([
      AppNotification,
      CompanyUser,
      User,
      NotificationChannelGlobalSetting,
      NotificationChannelRegistry,
      NotificationDelivery,
      NotificationMailLog,
      NotificationOutboxEvent,
      NotificationPreference,
      NotificationRule,
      NotificationTemplate,
    ]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
        signOptions: {
          expiresIn: (configService.get<string>('JWT_ACCESS_EXPIRATION') ??
            '20m') as StringValue,
        },
      }),
    }),
    ConditionalBullModule.registerQueue(NOTIFICATION_QUEUE),
    TokenBlacklistModule,
    MailModule,
    SmsModule,
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationsGateway,
    NotificationsService,
    NotificationOrchestratorService,
    NotificationConfigurationService,
    NotificationChannelManagementService,
    NotificationPreferencesService,
    NotificationDeliveryDispatcherService,
    NotificationQueuedTaskRunnerService,
    NotificationQueueService,
    NotificationProcessor,
    PostgresAdvisoryLockService,
  ],
  exports: [
    NotificationsService,
    NotificationOrchestratorService,
    NotificationConfigurationService,
    NotificationChannelManagementService,
    NotificationPreferencesService,
    NotificationQueueService,
  ],
})
export class NotificationsModule {}
