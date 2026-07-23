import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';
import { MAILER_OPTIONS } from '@nestjs-modules/mailer/dist/constants/mailer.constant';
import type { MailerTransportFactory } from '@nestjs-modules/mailer/dist/interfaces/mailer-transport-factory.interface';
import type {
  MailerOptions,
  TransportType,
} from '@nestjs-modules/mailer/dist/interfaces/mailer-options.interface';
import {
  applyMailRecipientSafety,
  appendMailRecipientSafetyDebugFooter,
  prepareMailRecipientSafety,
  resolveMailRecipientSafetyConfigFromConfigService,
  type ResolvedMailRecipientSafetyConfig,
  type SafeSendMailOptions,
} from './mail-recipient-safety.util';

type SafeMailWithMetadata = SafeSendMailOptions & {
  __mailRecipientSafetyResult?: ReturnType<typeof prepareMailRecipientSafety>;
};

type TransportMail = {
  data: SafeMailWithMetadata;
};

type TransportPlugin = (
  mail: TransportMail,
  callback: (error?: Error) => void,
) => void;

type MailTransporter = {
  use(step: 'stream' | 'compile', plugin: TransportPlugin): void;
};

type NodemailerModule = {
  createTransport(
    transport: TransportType,
    defaults?: MailerOptions['defaults'],
  ): MailTransporter;
};

const typedNodemailer = nodemailer as unknown as NodemailerModule;

@Injectable()
export class SafeMailerTransportFactory implements MailerTransportFactory {
  private readonly logger = new Logger(SafeMailerTransportFactory.name);
  private readonly safetyConfig: ResolvedMailRecipientSafetyConfig;

  constructor(
    @Inject(MAILER_OPTIONS)
    private readonly options: MailerOptions,
    private readonly configService: ConfigService,
  ) {
    this.safetyConfig = resolveMailRecipientSafetyConfigFromConfigService(
      this.configService,
    );
  }

  createTransport(opts?: TransportType): MailTransporter {
    const transporter = typedNodemailer.createTransport(
      opts || this.options.transport,
      this.options.defaults,
    );

    transporter.use('stream', (mail, callback) => {
      try {
        appendMailRecipientSafetyDebugFooter(
          mail.data,
          mail.data.__mailRecipientSafetyResult ??
            applyMailRecipientSafety(mail.data, this.safetyConfig, this.logger),
        );
        callback();
      } catch (error) {
        callback(error as Error);
      }
    });

    transporter.use('compile', (mail, callback) => {
      try {
        mail.data.__mailRecipientSafetyResult = prepareMailRecipientSafety(
          mail.data,
          this.safetyConfig,
          this.logger,
        );
        callback();
      } catch (error) {
        callback(error as Error);
      }
    });

    return transporter;
  }
}
