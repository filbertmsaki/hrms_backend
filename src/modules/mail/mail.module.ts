import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MAILER_TRANSPORT_FACTORY, MailerModule } from '@nestjs-modules/mailer';
import { join } from 'path';

import { MailService } from './mail.service';
import { MailOverrideWarningService } from './mail-override-warning.service';
import { SafeMailerTransportFactory } from './safe-mailer-transport.factory';

const { PugAdapter } = require('@nestjs-modules/mailer/dist/adapters/pug.adapter');

@Module({
  imports: [
    MailerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        transport: {
          host: config.get<string>('MAIL_HOST'),
          port: Number(config.get<string>('MAIL_PORT')),
          secure: config.get<boolean>('MAIL_SECURE') === true,
          auth: {
            user: config.get<string>('MAIL_USER'),
            pass: config.get<string>('MAIL_PASS'),
          },
        },
        defaults: {
          from: `"${config.get<string>('APP_NAME')}" <${config.get<string>('MAIL_FROM')}>`,
        },
        template: {
          dir: join(__dirname, 'templates'),
          adapter: new PugAdapter(),
          options: {
            strict: true,
          },
        },
      }),
      extraProviders: [
        {
          provide: MAILER_TRANSPORT_FACTORY,
          useClass: SafeMailerTransportFactory,
        },
      ],
    }),
  ],
  providers: [MailService, MailOverrideWarningService],
  exports: [MailService],
})
export class MailModule {}
