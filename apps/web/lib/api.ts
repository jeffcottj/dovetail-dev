import { cookies } from 'next/headers';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

export async function apiFetch<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const cookieStore = await cookies();
  const token = cookieStore.get('authjs.session-token')?.value;

  const res = await fetch(`${API_URL}${path}`, {
    cache: 'no-store',
    ...init,
    headers: {
      ...init?.headers,
      ...(token ? { Cookie: `authjs.session-token=${token}` } : {}),
    },
  });

  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }

  return res.json() as Promise<T>;
}
