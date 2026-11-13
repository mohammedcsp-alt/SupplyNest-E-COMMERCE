import { assertTestDatabase } from './testdb';

// Point the application's Prisma client and config at the TEST database before any app module is imported.
const url = process.env.TEST_DATABASE_URL;
assertTestDatabase(url);
process.env.DATABASE_URL = url;
(process.env as Record<string, string>).NODE_ENV = 'test';
process.env.APP_SECRET = process.env.APP_SECRET ?? 'test-secret-test-secret-test-secret-0123456789';
process.env.OTP_PROVIDER = 'mock';
process.env.FEATURE_FLAG_WMS_INTEGRATION = 'false';
process.env.UPLOAD_DIR = process.env.UPLOAD_DIR ?? './storage/test-uploads';
process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? 'error';
