'use strict';

function requiredEnv(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(
      `Missing required deployment environment variable: ${name}`,
    );
  }

  return value;
}

const baseDir = requiredEnv('BASE_DIR');
const appName = requiredEnv('PM2_APP_NAME');
const appEnv = requiredEnv('APP_ENV');
const appHost = requiredEnv('APP_HOST');
const appPort = requiredEnv('APP_PORT');

const maxMemory =
  process.env.PM2_MAX_MEMORY ||
  (appEnv === 'production' ? '700M' : '450M');

const nodeOptions =
  process.env.NODE_OPTIONS ||
  (appEnv === 'production'
    ? '--max-old-space-size=512'
    : '--max-old-space-size=320');

const logDir =
  process.env.PM2_LOG_DIR ||
  `${baseDir}/shared/logs`;

module.exports = {
  apps: [
    {
      name: appName,

      cwd: `${baseDir}/current`,
      script: 'dist/main.js',
      node_args: `--require ${baseDir}/current/deploy/hrms-backend/register-src-alias.cjs`,

      /*
       * Keep one instance because HRMS contains scheduled/background jobs.
       *
       * Do not switch to cluster mode until scheduled jobs have proper
       * distributed locking or are moved to a dedicated worker.
       */
      instances: 1,
      exec_mode: 'fork',

      autorestart: true,
      watch: false,

      max_memory_restart: maxMemory,

      restart_delay: 3000,

      kill_timeout: 15000,
      listen_timeout: 15000,

      wait_ready: false,

      env: {
        NODE_ENV: 'production',
        APP_ENV: appEnv,

        APP_HOST: appHost,
        APP_PORT: appPort,
        PORT: appPort,

        NODE_OPTIONS: nodeOptions,

        TZ: process.env.TZ || 'Africa/Dar_es_Salaam',
      },

      out_file: `${logDir}/${appName}-out.log`,
      error_file: `${logDir}/${appName}-error.log`,

      merge_logs: true,
      time: true,
    },
  ],
};
