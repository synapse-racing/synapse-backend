#!/bin/sh
set -eu

cd /home/container
export CI=true
export PORT="${SERVER_PORT:-${PORT:-3000}}"

# DATABASE_URL is read from .env by Prisma and NestJS.

# VortexSpace may save its pnpm bootstrap as an application dependency.
node <<'NODE'
const fs = require('node:fs');
const file = 'package.json';
const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
if (manifest.name !== 'synapse-backend') {
  throw new Error('This startup script is only intended for synapse-backend');
}
if (Object.hasOwn(manifest.dependencies ?? {}, 'pnpm')) {
  fs.copyFileSync(file, 'package.json.before-vortex-fix');
  delete manifest.dependencies.pnpm;
  fs.writeFileSync(file, JSON.stringify(manifest, null, 2) + '\n');
  console.log('Removed VortexSpace pnpm dependency; preserved packageManager version.');
}
NODE

echo "Installing backend dependencies..."
NODE_ENV=development pnpm install --frozen-lockfile --prod=false

echo "Generating Prisma client..."
node node_modules/prisma/build/index.js generate

echo "Building backend..."
node node_modules/@nestjs/cli/bin/nest.js build

echo "Preparing MongoDB indexes..."
node node_modules/prisma/build/index.js db push --skip-generate

export NODE_ENV=production
echo "Starting Synapse backend..."
exec node dist/main.js
