import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { createAppDataSourceOptions } from './typeorm-options';

dotenv.config();

export const AppDataSource = new DataSource(createAppDataSourceOptions());
