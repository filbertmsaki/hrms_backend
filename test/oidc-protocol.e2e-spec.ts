import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';

it('validates signed provider responses with the production OIDC client', async () => {
  await promisify(execFile)(
    process.execPath,
    [
      '-r',
      'ts-node/register/transpile-only',
      '-r',
      'tsconfig-paths/register',
      join(__dirname, 'helpers', 'oidc-protocol.cjs'),
    ],
    { timeout: 60000 },
  );
}, 65000);
