import { resolve } from 'node:path';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { db } from './connection.js';

async function runMigrations() {
  console.log('Running database migrations...');
  const migrationsFolder = resolve(__dirname, '..', 'migrations');
  await migrate(db, { migrationsFolder });
  console.log('Migrations complete.');
  process.exit(0);
}

runMigrations().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
