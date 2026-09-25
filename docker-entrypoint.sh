#!/bin/sh
set -e

echo "Waiting for database to be ready..."
retries=0
until npx prisma migrate deploy 2>/dev/null; do
  retries=$((retries + 1))
  if [ "$retries" -ge 30 ]; then
    echo "Database not ready after 30 attempts, giving up."
    exit 1
  fi
  echo "Database not ready yet, retrying in 2s... ($retries/30)"
  sleep 2
done

echo "Seeding database..."
npx prisma db seed || echo "Seed skipped (may already exist)"

echo "Starting server..."
exec node dist/server.js