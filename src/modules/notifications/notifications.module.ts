import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import type { StringValue } from 'ms';
import { PostgresAdvisoryLockService } from '../../common/database/postgres-advisory-lock.service';
import { AuthModule } from '../auth/auth.module';
import { CompanyUser } from '../companies/entities/company-user.entity';
import { MailModule } from '../mail/mail.module';
import { UsersModule } from '../users/users.module';
import { AppNotification } from './entities/app-notification.entity';
import { NotificationDelivery } from './entities/notification-delivery.entity';
import { NotificationOutboxEvent } from './entities/notification-outbox-event.entity';
import { NotificationPreference } from './entities/notification-preference.entity';
import { NotificationDeliveryDispatcherService } from './notification-delivery-dispatcher.service';
import { NotificationOrchestratorService } from './notification-orchestrator.service';
import { NotificationPreferencesService } from './notification-preferences.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsGateway } from './notifications.gateway';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AppNotification,
      CompanyUser,
      NotificationDelivery,
      NotificationOutboxEvent,
      NotificationPreference,
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
    AuthModule,
    UsersModule,
    MailModule,
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationsGateway,
    NotificationsService,
    NotificationOrchestratorService,
    NotificationPreferencesService,
    NotificationDeliveryDispatcherService,
    PostgresAdvisoryLockService,
  ],
  exports: [
    NotificationsService,
    NotificationOrchestratorService,
    NotificationPreferencesService,
  ],
})
export class NotificationsModule {}
