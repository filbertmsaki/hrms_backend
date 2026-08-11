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
let loadedPugAdapterConstructor: PugAdapterConstructor | null = null;

function resolvePugAdapterConstructor(): PugAdapterConstructor {
  if (loadedPugAdapterConstructor) {
    return loadedPugAdapterConstructor;
  }

  const mailerEntryPoint = mailerRequire.resolve('@nestjs-modules/mailer');
  const pugAdapterPath = join(
    dirname(mailerEntryPoint),
    'adapters',
    'pug.adapter.js',
  );

  const { PugAdapter: LoadedPugAdapter } = mailerRequire(pugAdapterPath) as {
    PugAdapter: PugAdapterConstructor;
  };

  loadedPugAdapterConstructor = LoadedPugAdapter;
  return loadedPugAdapterConstructor;
}

export class PugAdapter implements PugAdapterInstance {
  private delegate: PugAdapterInstance | null = null;

  constructor(private readonly config?: Record<string, unknown>) {}

  compile(
    mail: unknown,
    callback: (err?: unknown, body?: string) => unknown,
    options: MailerOptions,
  ): void {
    if (!this.delegate) {
      const LoadedPugAdapter = resolvePugAdapterConstructor();
      this.delegate = new LoadedPugAdapter(this.config);
    }

    this.delegate.compile(mail, callback, options);
  }
}
