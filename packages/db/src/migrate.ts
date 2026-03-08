import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { db } from './connection.js';

async function runMigrations() {
  console.log('Running database migrations...');
  await migrate(db, { migrationsFolder: './migrations' });
  console.log('Migrations complete.');
  process.exit(0);
}

runMigrations().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
