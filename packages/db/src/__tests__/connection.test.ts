import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { db } from '../connection.js';
import { users } from '../schema.js';

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
