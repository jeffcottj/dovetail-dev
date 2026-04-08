import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { db, parseSslOption } from '../connection.js';
import { users } from '../schema.js';

describe('parseSslOption', () => {
  it('returns false when no SSL indicators are present', () => {
    expect(parseSslOption('postgres://user:pass@localhost:5432/db', undefined)).toBe(false);
  });

  it('returns ssl config when connection string contains sslmode=require', () => {
    expect(
      parseSslOption('postgres://user:pass@host:5432/db?sslmode=require', undefined)
    ).toEqual({ rejectUnauthorized: true });
  });

  it('returns ssl config when DB_SSL is true', () => {
    expect(parseSslOption('postgres://user:pass@localhost:5432/db', 'true')).toEqual({
      rejectUnauthorized: true,
    });
  });

  it('returns false when DB_SSL is not true', () => {
    expect(parseSslOption('postgres://user:pass@localhost:5432/db', 'false')).toBe(false);
  });
});

describe('database connection', () => {
  it('can insert and retrieve a user', async () => {
    const [inserted] = await db.insert(users).values({
      email: 'test@example.com',
      name: 'Test User',
      role: 'viewer',
      provider: 'google',
      providerId: 'google-test-123',
    }).returning();

    expect(inserted.email).toBe('test@example.com');
    expect(inserted.role).toBe('viewer');

    // Clean up
    await db.delete(users).where(eq(users.id, inserted.id));
  });
});
