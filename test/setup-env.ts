process.env.NODE_ENV = 'test';
process.env.FRONTEND_URL = 'http://localhost:5173';
if (!process.env.SYNAPSE_TEST_DATABASE_URL) {
  throw new Error(
    'Run e2e tests with pnpm test:e2e to use an isolated database',
  );
}
process.env.DATABASE_URL = process.env.SYNAPSE_TEST_DATABASE_URL;
process.env.JWT_ACCESS_SECRET =
  'test-access-secret-with-at-least-32-characters';
process.env.JWT_REFRESH_SECRET =
  'test-refresh-secret-different-and-at-least-32-characters';
process.env.JWT_ACCESS_TTL_SECONDS = '900';
process.env.JWT_REFRESH_TTL_DAYS = '30';
