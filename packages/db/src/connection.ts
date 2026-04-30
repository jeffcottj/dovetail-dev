import { config } from 'dotenv';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { resolve } from 'node:path';
import * as schema from './schema.js';

config({ path: resolve(__dirname, '../../../.env') });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is not set');

export function parseSslOption(
  connStr: string,
  dbSslEnv: string | undefined,
): { rejectUnauthorized: true } | false {
  if (connStr.includes('sslmode=require') || dbSslEnv === 'true') {
    return { rejectUnauthorized: true };
  }
  return false;
}

const ssl = parseSslOption(connectionString, process.env.DB_SSL);

export const client = postgres(connectionString, { ssl });
export const db = drizzle(client, { schema });

export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    await client`select 1`;
    return true;
  } catch {
    return false;
  }
}
