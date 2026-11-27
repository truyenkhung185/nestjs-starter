import { DataSource } from 'typeorm';
import { Redis } from 'ioredis';

const ALLOWED_LOCAL_REDIS_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
const DEFAULT_SHARED_REDIS_PORT = 6379;

export function assertTestDatabase(dataSource: DataSource): void {
  const dbName = String(dataSource.options.database || '');
  if (!dbName.toLowerCase().includes('test')) {
    throw new Error(
      `Refusing to run destructive E2E DB operation on non-test database "${dbName}". ` +
        `Please configure a dedicated test database whose name contains "test" (e.g. nestjs_test_db).`,
    );
  }
}

export function assertTestRedis(host: string, port: number): void {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error(
      `Refusing to flush Redis when NODE_ENV="${process.env.NODE_ENV}" (must be "test").`,
    );
  }

  if (process.env.ALLOW_TEST_REDIS_FLUSH !== 'true') {
    throw new Error(
      `Refusing to flush Redis at ${host}:${port}: set ALLOW_TEST_REDIS_FLUSH=true in .env.test ` +
        `only for a dedicated E2E Redis instance.`,
    );
  }

  const normalizedHost = host.trim().toLowerCase();
  const isLocalOrTestHost =
    ALLOWED_LOCAL_REDIS_HOSTS.has(normalizedHost) ||
    normalizedHost.includes('test');

  if (!isLocalOrTestHost || port === DEFAULT_SHARED_REDIS_PORT) {
    throw new Error(
      `Refusing to flush Redis at ${host}:${port}. ` +
        `E2E tests require a dedicated local/test Redis endpoint on a non-default port (e.g. localhost:6380).`,
    );
  }
}

export async function prepareTestDatabase(dataSource: DataSource): Promise<void> {
  assertTestDatabase(dataSource);
  await dataSource.runMigrations();
  // Clean any leftover rows from previously interrupted test runs before first fixture
  await truncateAllTables(dataSource);
}

export async function truncateAllTables(dataSource: DataSource): Promise<void> {
  assertTestDatabase(dataSource);
  const tableNames = dataSource.entityMetadatas
    .map((meta) => `"${meta.tableName}"`)
    .filter(Boolean);

  if (tableNames.length === 0) {
    return;
  }

  await dataSource.query(
    `TRUNCATE TABLE ${tableNames.join(', ')} RESTART IDENTITY CASCADE;`,
  );
}

export async function flushTestRedis(): Promise<void> {
  const host = process.env.REDIS_HOST || 'localhost';
  const port = parseInt(process.env.REDIS_PORT || '6380', 10);

  assertTestRedis(host, port);

  const client = new Redis({
    host,
    port,
    password: process.env.REDIS_PASSWORD || undefined,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
  });

  try {
    await client.connect();
    await client.flushdb();
  } finally {
    await client.quit().catch(() => {});
  }
}
