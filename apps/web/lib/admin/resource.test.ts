import { afterEach, describe, expect, it, vi } from 'vitest';

const mockApiFetch = vi.fn();

vi.mock('../api', () => ({
  apiFetch: mockApiFetch,
}));

describe('fetchAdminResource', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns a not-found state for 404 responses', async () => {
    mockApiFetch.mockRejectedValue(new Error('API error: 404 Not Found'));

    const { fetchAdminResource } = await import('./resource');
    const result = await fetchAdminResource<{ id: string }>('/api/admin/users/u2');

    expect(result).toEqual({
      ok: false,
      kind: 'not_found',
      error: 'API error: 404 Not Found',
    });
  });

  it('returns an error state for transient failures', async () => {
    mockApiFetch.mockRejectedValue(new Error('network down'));

    const { fetchAdminResource } = await import('./resource');
    const result = await fetchAdminResource<{ id: string }>('/api/admin/users/u2');

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.kind).toBe('error');
    expect(result.error).toBe('network down');
  });
});
