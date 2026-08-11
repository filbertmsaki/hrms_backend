import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { resolveMailRecipientSafetyConfigFromConfigService } from './mail-recipient-safety.util';

@Injectable()
export class MailOverrideWarningService implements OnModuleInit {
  private readonly logger = new Logger(MailOverrideWarningService.name);

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const config = resolveMailRecipientSafetyConfigFromConfigService(
      this.configService,
    );

    if (!config.overrideEnabled) {
      return;
    }

    this.logger.warn(
      [
        'WARNING: Email recipient override is enabled.',
        'All application emails will be redirected to configured test recipients.',
        `Environment: ${config.rawEnvironment ?? config.environment}`,
        `Application: ${config.appName}`,
        `Test To Count: ${config.testTo.length}`,
        `Test Cc Count: ${config.testCc.length}`,
        `Test Bcc Count: ${config.testBcc.length}`,
      ].join(' '),
    );
  }
}
