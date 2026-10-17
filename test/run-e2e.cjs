const { spawn } = require('node:child_process');
const path = require('node:path');
const { MongoMemoryReplSet } = require('mongodb-memory-server');

function run(args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, options);
    child.once('error', reject);
    child.once('close', (code) => resolve(code ?? 1));
  });
}

async function main() {
  // Always use a private local replica set, never DATABASE_URL from .env.
  const replica = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  try {
    const databaseUrl = replica.getUri('synapse_e2e');
    const options = {
      cwd: path.resolve(__dirname, '..'),
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
        SYNAPSE_TEST_DATABASE_URL: databaseUrl,
      },
      stdio: 'inherit',
    };
    const schema = await run(
      [
        require.resolve('prisma/build/index.js'),
        'db',
        'push',
        '--skip-generate',
      ],
      options,
    );
    if (schema !== 0) {
      process.exitCode = schema;
      return;
    }
    const tests = await run(
      [
        require.resolve('jest/bin/jest'),
        '--config',
        './test/jest-e2e.json',
        ...process.argv.slice(2),
      ],
      options,
    );
    process.exitCode = tests;
  } finally {
    await replica.stop();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
