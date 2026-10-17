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
const schemaPath = 'prisma/schema.prisma';
if (!fs.existsSync('src/main.ts') || !fs.existsSync(schemaPath)) {
  throw new Error('Upload the CONTENTS of migration/mongodb to /home/container: src/, prisma/, package.json and tsconfig files must be at the same level. Do not leave them inside synapse-backend-main/.');
}
const schema = fs.readFileSync(schemaPath, 'utf8');
if (!/provider\s*=\s*"mongodb"/.test(schema)) {
  throw new Error('The active prisma/schema.prisma is not MongoDB. Replace it with the schema from migration/mongodb before starting.');
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
node node_modules/prisma/build/index.js generate --schema prisma/schema.prisma

echo "Building backend..."
node node_modules/@nestjs/cli/bin/nest.js build

echo "Preparing MongoDB indexes..."
node node_modules/prisma/build/index.js db push --schema prisma/schema.prisma --skip-generate

export NODE_ENV=production
echo "Starting Synapse backend..."
exec node dist/main.js
