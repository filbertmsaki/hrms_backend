import { runSeeders } from 'typeorm-extension';
import { AppDataSource } from '../data-source';
import LeaveStatutoryTemplatesSeeder from './leave-statutory-templates.seed';

/** Creates draft (unverified) Tanzania statutory leave templates per company. */
async function bootstrap() {
  await AppDataSource.initialize();
  try {
    await runSeeders(AppDataSource, { seeds: [LeaveStatutoryTemplatesSeeder] });
  } finally {
    await AppDataSource.destroy();
  }
}

bootstrap().catch((error: unknown) => {
  console.error('Leave statutory template setup failed.', error);
  process.exit(1);
});
