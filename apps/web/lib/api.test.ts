import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const cookieGet = vi.fn();

vi.mock('next/headers', () => ({
  cookies: async () => ({ get: cookieGet }),
}));

describe('apiFetch cookie forwarding', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
    cookieGet.mockReset();
    fetchMock.mockReset();
  });

  it('forwards __Secure- cookie when present', async () => {
    cookieGet.mockImplementation((name: string) =>
      name === '__Secure-authjs.session-token' ? { value: 'secure-token' } : undefined,
    );

    const { apiFetch } = await import('./api');
    await apiFetch('/api/me');

    const init = fetchMock.mock.calls[0][1];
    expect(init.headers.Cookie).toBe('__Secure-authjs.session-token=secure-token');
  });

  it('falls back to bare cookie when secure is absent', async () => {
    cookieGet.mockImplementation((name: string) =>
      name === 'authjs.session-token' ? { value: 'bare-token' } : undefined,
    );

    const { apiFetch } = await import('./api');
    await apiFetch('/api/me');

    const init = fetchMock.mock.calls[0][1];
    expect(init.headers.Cookie).toBe('authjs.session-token=bare-token');
  });

  it('prefers __Secure- when both are present', async () => {
    cookieGet.mockImplementation((name: string) => {
      if (name === '__Secure-authjs.session-token') return { value: 'secure-token' };
      if (name === 'authjs.session-token') return { value: 'bare-token' };
      return undefined;
    });

    const { apiFetch } = await import('./api');
    await apiFetch('/api/me');

    const init = fetchMock.mock.calls[0][1];
    expect(init.headers.Cookie).toBe('__Secure-authjs.session-token=secure-token');
  });

  it('omits Cookie header when no session cookie is present', async () => {
    cookieGet.mockReturnValue(undefined);

    const { apiFetch } = await import('./api');
    await apiFetch('/api/me');

    const init = fetchMock.mock.calls[0][1];
    expect(init.headers.Cookie).toBeUndefined();
  });
});
