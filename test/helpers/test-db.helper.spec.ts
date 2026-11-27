import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  assertTestDatabase,
  assertTestRedis,
  prepareTestDatabase,
  truncateAllTables,
} from './test-db.helper.js';

describe('test-db.helper', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('assertTestDatabase', () => {
    it('should allow database names containing "test"', () => {
      const ds = { options: { database: 'nestjs_test_db' } } as any;
      expect(() => assertTestDatabase(ds)).not.toThrow();
    });

    it('should throw when attempting to run against non-test database', () => {
      const ds = { options: { database: 'nestjs_db' } } as any;
      expect(() => assertTestDatabase(ds)).toThrow(/non-test database/);
    });
  });

  describe('assertTestRedis', () => {
    it('should allow dedicated local or test-named Redis on non-default port with opt-in flag', () => {
      process.env.NODE_ENV = 'test';
      process.env.ALLOW_TEST_REDIS_FLUSH = 'true';

      expect(() => assertTestRedis('localhost', 6380)).not.toThrow();
      expect(() => assertTestRedis('127.0.0.1', 6380)).not.toThrow();
      expect(() => assertTestRedis('redis-test', 6380)).not.toThrow();
    });

    it('should reject default shared Redis port 6379', () => {
      process.env.NODE_ENV = 'test';
      process.env.ALLOW_TEST_REDIS_FLUSH = 'true';

      expect(() => assertTestRedis('localhost', 6379)).toThrow(/non-default port/);
    });

    it('should reject non-local non-test host', () => {
      process.env.NODE_ENV = 'test';
      process.env.ALLOW_TEST_REDIS_FLUSH = 'true';

      expect(() => assertTestRedis('redis.prod.internal', 6380)).toThrow(
        /dedicated local\/test Redis/,
      );
    });

    it('should reject when ALLOW_TEST_REDIS_FLUSH is not true', () => {
      process.env.NODE_ENV = 'test';
      delete process.env.ALLOW_TEST_REDIS_FLUSH;

      expect(() => assertTestRedis('localhost', 6380)).toThrow(
        /ALLOW_TEST_REDIS_FLUSH=true/,
      );
    });

    it('should reject when NODE_ENV is not test', () => {
      process.env.NODE_ENV = 'development';
      process.env.ALLOW_TEST_REDIS_FLUSH = 'true';

      expect(() => assertTestRedis('localhost', 6380)).toThrow(/NODE_ENV/);
    });
  });

  describe('prepareTestDatabase & truncateAllTables', () => {
    it('should run migrations and then truncate all tables before first fixture', async () => {
      const callOrder: string[] = [];
      const ds = {
        options: { database: 'nestjs_test_db' },
        entityMetadatas: [{ tableName: 'users' }, { tableName: 'comments' }],
        runMigrations: vi.fn(async () => {
          callOrder.push('migrate');
        }),
        query: vi.fn(async () => {
          callOrder.push('truncate');
        }),
      } as any;

      await prepareTestDatabase(ds);

      expect(callOrder).toEqual(['migrate', 'truncate']);
      expect(ds.query).toHaveBeenCalledWith(
        'TRUNCATE TABLE "users", "comments" RESTART IDENTITY CASCADE;',
      );
    });

    it('should truncate all entity tables with RESTART IDENTITY CASCADE', async () => {
      const ds = {
        options: { database: 'nestjs_test_db' },
        entityMetadatas: [
          { tableName: 'users' },
          { tableName: 'articles' },
          { tableName: 'comments' },
        ],
        query: vi.fn().mockResolvedValue(undefined),
      } as any;

      await truncateAllTables(ds);

      expect(ds.query).toHaveBeenCalledWith(
        'TRUNCATE TABLE "users", "articles", "comments" RESTART IDENTITY CASCADE;',
      );
    });
  });
});
