const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const directory = fs.mkdtempSync(path.resolve(__dirname, '../prisma/.test-'));
fs.closeSync(fs.openSync(path.join(directory, 'test.db'), 'wx'));
const databaseUrl = 'file:./' + path.basename(directory) + '/test.db';
const options = {
  cwd: path.resolve(__dirname, '..'),
  env: {
    ...process.env,
    DATABASE_URL: databaseUrl,
    SYNAPSE_TEST_DATABASE_URL: databaseUrl,
  },
  stdio: 'inherit',
};

try {
  const migration = spawnSync(
    process.execPath,
    [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'],
    options,
  );
  if (migration.status !== 0) {
    process.exitCode = migration.status ?? 1;
  } else {
    const tests = spawnSync(
      process.execPath,
      [
        require.resolve('jest/bin/jest'),
        '--config',
        './test/jest-e2e.json',
        ...process.argv.slice(2),
      ],
      options,
    );
    process.exitCode = tests.status ?? 1;
  }
} finally {
  fs.rmSync(directory, { recursive: true, force: true });
}
