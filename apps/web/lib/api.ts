import { cookies } from 'next/headers';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

const SECURE_COOKIE_NAME = '__Secure-authjs.session-token';
const COOKIE_NAME = 'authjs.session-token';

export async function apiFetch<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const cookieStore = await cookies();
  // Forward the same cookie name verbatim so the API derives the matching
  // HKDF salt. Production HTTPS sets __Secure-authjs.session-token; HTTP/dev
  // sets the bare authjs.session-token.
  const secureToken = cookieStore.get(SECURE_COOKIE_NAME)?.value;
  const token = cookieStore.get(COOKIE_NAME)?.value;
  let cookieHeader: string | undefined;
  if (secureToken) {
    cookieHeader = `${SECURE_COOKIE_NAME}=${secureToken}`;
  } else if (token) {
    cookieHeader = `${COOKIE_NAME}=${token}`;
  }

  const res = await fetch(`${API_URL}${path}`, {
    cache: 'no-store',
    ...init,
    headers: {
      ...init?.headers,
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
    },
  });

  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }

  return res.json() as Promise<T>;
}
