import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { assertFieldEncryptionConfiguration } from './field-encryption';

/** Fails application start-up on an invalid encryption configuration. */
@Injectable()
export class FieldEncryptionStartupCheck implements OnModuleInit {
  private readonly logger = new Logger(FieldEncryptionStartupCheck.name);

  onModuleInit() {
    const status = assertFieldEncryptionConfiguration();
    if (status.enabled) {
      this.logger.log(
        `Field encryption enabled (active key ${status.activeVersion}; versions ${status.versions.join(', ')}).`,
      );
    }
  }
}
