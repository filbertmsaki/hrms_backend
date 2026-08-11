import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { DataSourceOptions } from 'typeorm';
import { SeederOptions } from 'typeorm-extension';

type SslOptions = false | { rejectUnauthorized: boolean };

function parseBoolean(
  value: string | boolean | undefined,
  defaultValue: boolean,
): boolean {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value !== 'string') {
    return defaultValue;
  }

  const normalized = value.trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(normalized)) {
    return true;
  }
  if (['false', '0', 'no', 'off'].includes(normalized)) {
    return false;
  }

  return defaultValue;
}

function parseNumber(
  value: string | number | undefined,
  defaultValue: number,
): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== 'string' || value.trim().length === 0) {
    return defaultValue;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

function buildSslOptions(
  enabled: boolean,
  rejectUnauthorized: boolean,
): SslOptions {
  if (!enabled) {
    return false;
  }

  return { rejectUnauthorized };
}

export function createBaseTypeOrmOptionsFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): DataSourceOptions {
  const logging = (env.NODE_ENV ?? 'development') === 'development';
  const sslEnabled = parseBoolean(env.DB_SSL_ENABLED, false);
  const rejectUnauthorized = parseBoolean(env.DB_SSL_REJECT_UNAUTHORIZED, true);

  return {
    type: 'postgres',
    host: env.DB_HOST || 'localhost',
    port: parseNumber(env.DB_PORT, 5432),
    username: env.DB_USERNAME || 'postgres',
    password: env.DB_PASSWORD || '',
    database: env.DB_NAME || 'hrms_db',
    synchronize: false,
    logging,
    maxQueryExecutionTime: parseNumber(env.DB_SLOW_QUERY_MS, 2000),
    ssl: buildSslOptions(sslEnabled, rejectUnauthorized),
    extra: {
      max: parseNumber(env.DB_POOL_MAX, 15),
      min: parseNumber(env.DB_POOL_MIN, 2),
      connectionTimeoutMillis: parseNumber(env.DB_CONNECTION_TIMEOUT_MS, 10000),
      idleTimeoutMillis: parseNumber(env.DB_IDLE_TIMEOUT_MS, 30000),
      statement_timeout: parseNumber(env.DB_STATEMENT_TIMEOUT_MS, 30000),
      application_name: 'hrms-backend',
    },
  };
}

export function createBaseTypeOrmOptionsFromConfig(
  configService: ConfigService,
): TypeOrmModuleOptions {
  const logging =
    configService.get<string>('NODE_ENV', 'development') === 'development';
  const sslEnabled = configService.get<boolean>('DB_SSL_ENABLED', false);
  const rejectUnauthorized = configService.get<boolean>(
    'DB_SSL_REJECT_UNAUTHORIZED',
    true,
  );

  return {
    type: 'postgres',
    host: configService.get<string>('DB_HOST', 'localhost'),
    port: configService.get<number>('DB_PORT', 5432),
    username: configService.get<string>('DB_USERNAME', 'postgres'),
    password: configService.get<string>('DB_PASSWORD', ''),
    database: configService.get<string>('DB_NAME', 'hrms_db'),
    synchronize: false,
    logging,
    maxQueryExecutionTime: configService.get<number>('DB_SLOW_QUERY_MS', 2000),
    ssl: buildSslOptions(sslEnabled, rejectUnauthorized),
    extra: {
      max: configService.get<number>('DB_POOL_MAX', 15),
      min: configService.get<number>('DB_POOL_MIN', 2),
      connectionTimeoutMillis: configService.get<number>(
        'DB_CONNECTION_TIMEOUT_MS',
        10000,
      ),
      idleTimeoutMillis: configService.get<number>('DB_IDLE_TIMEOUT_MS', 30000),
      statement_timeout: configService.get<number>(
        'DB_STATEMENT_TIMEOUT_MS',
        30000,
      ),
      application_name: 'hrms-backend',
    },
  };
}

export function createAppTypeOrmModuleOptions(
  configService: ConfigService,
): TypeOrmModuleOptions {
  return {
    ...createBaseTypeOrmOptionsFromConfig(configService),
    entities: [
      __dirname + '/../**/*.entity{.ts,.js}',
      __dirname + '/../**/*.entities{.ts,.js}',
    ],
    migrationsRun: false,
  };
}

export function createAppDataSourceOptions(
  env: NodeJS.ProcessEnv = process.env,
): DataSourceOptions & SeederOptions {
  return {
    ...createBaseTypeOrmOptionsFromEnv(env),

    entities: [
      __dirname + '/../**/*.entity{.ts,.js}',
      __dirname + '/../**/*.entities{.ts,.js}',
    ],

    migrations: [__dirname + '/migrations/*{.ts,.js}'],

    migrationsTableName: 'migrations',

    seeds: [__dirname + '/seeds/*.seed{.ts,.js}'],

    factories: [__dirname + '/factories/*.factory{.ts,.js}'],
  };
}
