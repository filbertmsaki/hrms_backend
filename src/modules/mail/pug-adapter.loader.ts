import type { MailerOptions } from '@nestjs-modules/mailer';
import { dirname, join } from 'path';
import { createRequire } from 'module';

type PugAdapterInstance = {
  compile(
    mail: unknown,
    callback: (err?: unknown, body?: string) => unknown,
    options: MailerOptions,
  ): void;
};

type PugAdapterConstructor = new (
  config?: Record<string, unknown>,
) => PugAdapterInstance;

const mailerRequire = createRequire(__filename);
const mailerEntryPoint = mailerRequire.resolve('@nestjs-modules/mailer');
const pugAdapterPath = join(
  dirname(mailerEntryPoint),
  'adapters',
  'pug.adapter.js',
);

const { PugAdapter: LoadedPugAdapter } = mailerRequire(pugAdapterPath) as {
  PugAdapter: PugAdapterConstructor;
};

export const PugAdapter = LoadedPugAdapter;
