// run-seed.ts
import { AppDataSource } from '../data-source';
import { runAllSeeders } from './index';

async function bootstrap() {
  await AppDataSource.initialize();
  await runAllSeeders(AppDataSource);
  await AppDataSource.destroy();
}
bootstrap();
