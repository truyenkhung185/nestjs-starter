import { DataSource, DataSourceOptions } from 'typeorm';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envPath = process.env.NODE_ENV === 'test' ? '.env.test' : '.env';
dotenv.config({ path: envPath });

/**
 * Automatically discovers all migration files in chronological filename order
 * for both compiled CLI execution (dist/migrations/*.js) and TS test execution (src/migrations/*.ts).
 */
export function resolveMigrationsGlob(): string[] {
  const isCompiledJs = path.extname(__filename) === '.js';
  const pattern = isCompiledJs ? '*.js' : '*.ts';
  return [path.join(__dirname, '..', 'migrations', pattern).replace(/\\/g, '/')];
}

export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'nestjs_db',
  entities: [path.join(process.cwd(), 'dist', '**', '*.entity.js')],
  migrations: resolveMigrationsGlob(),
  synchronize: false,
  logging: process.env.NODE_ENV === 'development',
};

const dataSource = new DataSource(dataSourceOptions);
export default dataSource;
