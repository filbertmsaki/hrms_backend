import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { validateEnv } from './config/env.validation';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AppService } from './app.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SecurityModule } from './modules/security/security.module';
import { IdentitySyncModule } from './modules/identity-sync/identity-sync.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { RolesModule } from './modules/roles/roles.module';
import { PermissionsModule } from './modules/permissions/permissions.module';
import { MailModule } from './modules/mail/mail.module';
import { CompaniesModule } from './modules/companies/companies.module';
import { HrModule } from './modules/hr/hr.module';
import { HikvisionModule } from './modules/hikvision/hikvision.module';
import { AccessControlModule } from './modules/access-control/access-control.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ScheduledReportingModule } from './modules/scheduled-reporting/scheduled-reporting.module';
import { SystemHealthModule } from './modules/system-health/system-health.module';
import { TenantGuard } from './common/guards/tenant.guard';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { SupportModule } from './modules/support/support.module';
import { createAppTypeOrmModuleOptions } from './database/typeorm-options';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { ConditionalBullModule } from './infrastructure/queues/conditional-bull.module';
import { UserAwareThrottlerGuard } from './common/guards/user-aware-throttler.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      expandVariables: true,
      envFilePath: [
        `.env.${process.env.APP_ENV ?? process.env.NODE_ENV ?? 'development'}.local`,
        '.env.local',
        '.env',
      ],
      validate: validateEnv,
    }),
    ScheduleModule.forRoot({
      cronJobs: process.env.NODE_ENV !== 'test',
      intervals: process.env.NODE_ENV !== 'test',
      timeouts: process.env.NODE_ENV !== 'test',
    }),
    EventEmitterModule.forRoot(),
    ConditionalBullModule.forRoot(),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => [
        {
          name: 'default',
          ttl: Number(configService.get<string>('THROTTLER_TTL') ?? 60000),
          limit: Number(configService.get<string>('THROTTLER_LIMIT') ?? 100),
        },
      ],
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) =>
        createAppTypeOrmModuleOptions(configService),
    }),
    SecurityModule,
    IdentitySyncModule,
    AuthModule,
    UsersModule,
    CompaniesModule,
    RolesModule,
    PermissionsModule,
    MailModule,
    HrModule,
    HikvisionModule,
    AccessControlModule,
    NotificationsModule,
    ScheduledReportingModule,
    SystemHealthModule,
    AnalyticsModule,
    SupportModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    TenantGuard,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: UserAwareThrottlerGuard,
    },
  ],
})
export class AppModule {}
