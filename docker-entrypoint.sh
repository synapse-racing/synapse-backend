#!/bin/sh
set -eu

./node_modules/.bin/prisma db push --skip-generate
exec node dist/main.js
