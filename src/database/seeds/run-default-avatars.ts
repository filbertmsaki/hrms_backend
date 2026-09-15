import { runSeeders } from 'typeorm-extension';
import { AppDataSource } from '../data-source';
import DefaultAvatarsSeeder from './037-default-avatars.seed';

async function bootstrap() {
  await AppDataSource.initialize();
  try {
    await runSeeders(AppDataSource, {
      seeds: [DefaultAvatarsSeeder],
    });
  } finally {
    await AppDataSource.destroy();
  }
}

bootstrap().catch((error: unknown) => {
  console.error('Default avatar repair failed.', error);
  process.exit(1);
});
