// run-seed.ts
import { AppDataSource } from '../data-source';
import { runAllSeeders } from './index';
import {
  assertLegacySeedChainAllowed,
  assertSecureSeederPasswords,
} from './seeder-guards';

async function bootstrap() {
  assertLegacySeedChainAllowed();
  assertSecureSeederPasswords();
  await AppDataSource.initialize();
  await runAllSeeders(AppDataSource);
  await AppDataSource.destroy();
}
bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
