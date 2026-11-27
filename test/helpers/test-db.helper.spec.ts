import { describe, it, expect, vi } from 'vitest';
import { assertTestDatabase, truncateAllTables } from './test-db.helper.js';

describe('test-db.helper', () => {
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

  describe('truncateAllTables', () => {
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
