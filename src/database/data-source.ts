import { DataSource } from 'typeorm';
import { applyCommandEnv } from './load-command-env';
import { createAppDataSourceOptions } from './typeorm-options';

const commandEnv = applyCommandEnv();

export const AppDataSource = new DataSource(
  createAppDataSourceOptions(commandEnv),
);
