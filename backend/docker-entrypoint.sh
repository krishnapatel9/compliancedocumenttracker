#!/bin/sh

echo "DocShield Container Startup: Checking database availability..."

# Retry prisma migrations dev/deploy until the PostgreSQL container is ready to accept queries
retry_count=0
max_retries=15

until npx prisma migrate deploy || [ $retry_count -eq $max_retries ]; do
  echo "Database connection not ready yet. Retrying migrations in 3 seconds ($((retry_count+1))/$max_retries)..."
  sleep 3
  retry_count=$((retry_count+1))
done

if [ $retry_count -eq $max_retries ]; then
  echo "Error: Database connection timed out. Exiting."
  exit 1
fi

echo "Database migrations applied. Seeding administrative and document data records..."
node prisma/seed.js

echo "Seeding completed. Launching backend API process..."
npm start
