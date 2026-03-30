import { afterEach, describe, expect, it, vi } from 'vitest';

const mockApiFetch = vi.fn();

vi.mock('../api', () => ({
  apiFetch: mockApiFetch,
}));

describe('fetchGlobalAdminOverview', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns an explicit failure state when the overview request fails', async () => {
    mockApiFetch.mockRejectedValue(new Error('network down'));

    const { fetchGlobalAdminOverview } = await import('./workspace');
    const overview = await fetchGlobalAdminOverview();

    expect(overview.ok).toBe(false);
    if (!overview.ok) {
      expect(overview.error).toBe('network down');
    }
    expect('metrics' in overview).toBe(false);
    expect('activity' in overview).toBe(false);
  });
});
