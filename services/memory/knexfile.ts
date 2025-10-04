import type { Knex } from 'knex/types';
import 'knex';
import path from 'path';
import { database } from './src/config';

// Update with your config settings.
const config: { [key: string]: Knex.Config } = {
  development: {
    ...database,
    migrations: {
      tableName: 'knex_migrations',
      directory: path.join(__dirname, 'migrations'),
    },
    seeds: {
      directory: path.join(__dirname, 'seeds'),
    },
    useNullAsDefault: true,
  },
  production: {
    ...database,
    migrations: {
      tableName: 'knex_migrations',
      directory: path.join(__dirname, 'migrations'),
    },
    seeds: {
      directory: path.join(__dirname, 'seeds'),
    },
  },
};

export default config;
