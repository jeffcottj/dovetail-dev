import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveCategoryPath, buildCategoryPath } from '../utils/category-path.js';

// Mock the db module
vi.mock('@dovetail/db', () => {
  const executeMock = vi.fn();
  return {
    db: { execute: executeMock },
    categories: {
      slug: { name: 'slug' },
      parentId: { name: 'parent_id' },
      id: { name: 'id' },
    },
  };
});

import { db } from '@dovetail/db';
const executeMock = db.execute as ReturnType<typeof vi.fn>;

beforeEach(() => {
  executeMock.mockReset();
});

describe('resolveCategoryPath', () => {
  it('resolves a single-segment path (root category)', async () => {
    executeMock.mockResolvedValueOnce([{ id: 'cat-1' }]);
    const result = await resolveCategoryPath(['housing']);
    expect(result).toBe('cat-1');
  });

  it('resolves a multi-segment path', async () => {
    executeMock
      .mockResolvedValueOnce([{ id: 'cat-1' }])   // housing
      .mockResolvedValueOnce([{ id: 'cat-2' }]);   // housing/rental
    const result = await resolveCategoryPath(['housing', 'rental']);
    expect(result).toBe('cat-2');
  });

  it('returns null when a segment does not match', async () => {
    executeMock.mockResolvedValueOnce([]);
    const result = await resolveCategoryPath(['nonexistent']);
    expect(result).toBeNull();
  });

  it('returns null for empty segments', async () => {
    const result = await resolveCategoryPath([]);
    expect(result).toBeNull();
  });
});

describe('buildCategoryPath', () => {
  it('returns slug array from leaf to root', async () => {
    executeMock.mockResolvedValueOnce([
      { slug: 'housing', depth: 1 },
      { slug: 'rental', depth: 0 },
    ]);
    const result = await buildCategoryPath('cat-2');
    expect(result).toEqual(['housing', 'rental']);
  });

  it('returns single-element array for root category', async () => {
    executeMock.mockResolvedValueOnce([
      { slug: 'housing', depth: 0 },
    ]);
    const result = await buildCategoryPath('cat-1');
    expect(result).toEqual(['housing']);
  });

  it('returns empty array when category not found', async () => {
    executeMock.mockResolvedValueOnce([]);
    const result = await buildCategoryPath('nonexistent');
    expect(result).toEqual([]);
  });
});
