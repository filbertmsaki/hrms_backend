import { DataSource, DataSourceOptions } from 'typeorm';
import { SeederOptions } from 'typeorm-extension';
import * as dotenv from 'dotenv';

dotenv.config();

export const AppDataSource = new DataSource({
  type: 'mysql',
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  username: process.env.DB_USERNAME || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'rbac_db',

  entities: ['src/**/*.entity{.ts,.js}'],

 migrations: ['src/database/migrations/*{.ts,.js}'],
  migrationsTableName: 'migrations',

  seeds: ['src/database/seeds/*.seed.ts'],
  factories: ['src/database/factories/*.factory{.ts,.js}'],

  synchronize: false, // NEVER true in production!
  logging: process.env.NODE_ENV === 'development' ? ['query', 'error'] : false,

} as DataSourceOptions & SeederOptions);