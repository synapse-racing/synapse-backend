process.env.NODE_ENV = 'test';
process.env.FRONTEND_URL = 'http://localhost:5173';
process.env.DATABASE_URL =
  'postgresql://synapse:synapse@localhost:5432/synapse?schema=public';
process.env.JWT_ACCESS_SECRET =
  'test-access-secret-with-at-least-32-characters';
process.env.JWT_REFRESH_SECRET =
  'test-refresh-secret-different-and-at-least-32-characters';
process.env.JWT_ACCESS_TTL_SECONDS = '900';
process.env.JWT_REFRESH_TTL_DAYS = '30';
