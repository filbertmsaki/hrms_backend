import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { createBaseTypeOrmOptionsFromEnv } from './database/typeorm-options';

// Deprecated compatibility export. New migrations, seeding, and runtime wiring
// should use src/database/data-source.ts and src/database/typeorm-options.ts.
export const typeOrmConfig: TypeOrmModuleOptions = {
  ...createBaseTypeOrmOptionsFromEnv(),
  // Keep this compatibility config aligned with src/database/data-source.ts.
  entities: [
    __dirname + '/**/*.entity{.ts,.js}',
    __dirname + '/**/*.entities{.ts,.js}',
  ],
  migrations: [__dirname + '/database/migrations/*{.ts,.js}'],
  migrationsTableName: 'migrations',
  synchronize: false,
  logging: process.env.NODE_ENV === 'development',
};
