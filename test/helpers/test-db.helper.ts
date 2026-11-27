import { DataSource } from 'typeorm';
import { Redis } from 'ioredis';

export function assertTestDatabase(dataSource: DataSource): void {
  const dbName = String(dataSource.options.database || '');
  if (!dbName.toLowerCase().includes('test')) {
    throw new Error(
      `Refusing to run destructive E2E DB operation on non-test database "${dbName}". ` +
        `Please configure a dedicated test database whose name contains "test" (e.g. nestjs_test_db).`,
    );
  }
}

export async function prepareTestDatabase(dataSource: DataSource): Promise<void> {
  assertTestDatabase(dataSource);
  await dataSource.runMigrations();
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
  if (process.env.NODE_ENV !== 'test') {
    return;
  }

  const client = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6380', 10),
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
