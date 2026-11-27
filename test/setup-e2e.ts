import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

process.env.NODE_ENV = 'test';

const hadExternalRedisEnv = Boolean(
  process.env.REDIS_HOST || process.env.REDIS_PORT,
);

const testEnvPath = path.resolve(process.cwd(), '.env.test');
const loadedTestEnv = fs.existsSync(testEnvPath);
if (loadedTestEnv) {
  dotenv.config({ path: testEnvPath, override: true });
}

// Fallback defaults dedicated strictly to the isolated E2E test environment
process.env.DB_HOST ??= 'localhost';
process.env.DB_PORT ??= '5433';
process.env.DB_USERNAME ??= 'postgres';
process.env.DB_PASSWORD ??= 'postgres';
process.env.DB_NAME ??= 'nestjs_test_db';
process.env.REDIS_HOST ??= 'localhost';
process.env.REDIS_PORT ??= '6380';
process.env.JWT_SECRET ??= 'e2e-test-only-jwt-secret-change-if-needed';
process.env.JWT_EXPIRES_IN ??= '15m';

// Only auto-enable Redis flush when using our dedicated fallback endpoint (not inherited shell Redis)
if (!loadedTestEnv && !hadExternalRedisEnv) {
  process.env.ALLOW_TEST_REDIS_FLUSH ??= 'true';
}
