const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { PrismaClient } = require('@prisma/client');

const testDatabaseUrl =
  'postgresql://synapse:synapse@localhost:5432/synapse_test?schema=public';
const options = {
  cwd: path.resolve(__dirname, '..'),
  env: { ...process.env, DATABASE_URL: testDatabaseUrl },
  shell: process.platform === 'win32',
  stdio: 'inherit',
};

async function run() {
  const admin = new PrismaClient({
    datasourceUrl:
      'postgresql://synapse:synapse@localhost:5432/postgres?schema=public',
  });
  try {
    const existing = await admin.$queryRawUnsafe(
      "SELECT 1 FROM pg_database WHERE datname = 'synapse_test'",
    );
    if (existing.length === 0) {
      await admin.$executeRawUnsafe('CREATE DATABASE synapse_test');
    }
  } finally {
    await admin.$disconnect();
  }

  const migration = spawnSync(
    'corepack',
    ['pnpm', 'exec', 'prisma', 'migrate', 'deploy'],
    options,
  );
  if (migration.status !== 0) process.exit(migration.status ?? 1);

  const tests = spawnSync(
    'corepack',
    [
      'pnpm',
      'exec',
      'jest',
      '--config',
      './test/jest-e2e.json',
      ...process.argv.slice(2),
    ],
    options,
  );
  process.exit(tests.status ?? 1);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
