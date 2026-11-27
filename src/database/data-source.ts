import { DataSource, DataSourceOptions } from 'typeorm';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { CreateUsersTable1731154000000 } from '../migrations/1731154000000-CreateUsersTable.js';
import { CreateAttachmentsAndFollows1732090000000 } from '../migrations/1732090000000-CreateAttachmentsAndFollows.js';
import { CreateArticlesAndFavorites1732100000000 } from '../migrations/1732100000000-CreateArticlesAndFavorites.js';
import { CreateCommentsTable1732500000000 } from '../migrations/1732500000000-CreateCommentsTable.js';

const envPath = process.env.NODE_ENV === 'test' ? '.env.test' : '.env';
dotenv.config({ path: envPath });

export const MIGRATIONS = [
  CreateUsersTable1731154000000,
  CreateAttachmentsAndFollows1732090000000,
  CreateArticlesAndFavorites1732100000000,
  CreateCommentsTable1732500000000,
];

export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'nestjs_db',
  entities: [path.join(process.cwd(), 'dist', '**', '*.entity.js')],
  migrations: MIGRATIONS,
  synchronize: false,
  logging: process.env.NODE_ENV === 'development',
};

const dataSource = new DataSource(dataSourceOptions);
export default dataSource;
