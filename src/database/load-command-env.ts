import * as dotenv from 'dotenv';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

export function loadCommandEnv(
  env: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const configuredEnvironment =
    env.APP_ENV?.trim() || env.NODE_ENV?.trim() || 'development';
  const envFilePaths =
    configuredEnvironment.toLowerCase() === 'uat'
      ? ['.env']
      : [`.env.${configuredEnvironment}.local`, '.env.local', '.env'];
  const merged: NodeJS.ProcessEnv = {};

  for (const envFilePath of [...envFilePaths].reverse()) {
    const absolutePath = resolve(process.cwd(), envFilePath);

    if (!existsSync(absolutePath)) {
      continue;
    }

    Object.assign(merged, dotenv.parse(readFileSync(absolutePath)));
  }

  return {
    ...merged,
    ...env,
  };
}

export function applyCommandEnv(
  env: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const effectiveEnv = loadCommandEnv(env);

  for (const [key, value] of Object.entries(effectiveEnv)) {
    if (value !== undefined) {
      process.env[key] = value;
    }
  }

  return process.env;
}
