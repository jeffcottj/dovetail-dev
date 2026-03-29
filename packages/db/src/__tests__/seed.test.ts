import { describe, expect, it } from 'vitest';
import { DEV_KNOWLEDGE_BASES } from '../seed-data.js';

describe('development seed data', () => {
  it('exposes the seeded knowledge base at the housing slug for local admin routes', () => {
    expect(Object.values(DEV_KNOWLEDGE_BASES)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          slug: 'housing',
        }),
      ]),
    );
  });
});
