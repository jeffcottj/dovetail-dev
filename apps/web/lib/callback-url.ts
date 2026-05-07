// Validates a post-login callback URL. Only same-origin paths are allowed,
// and we reject /login itself to avoid redirect loops. Returns null if the
// value is unsafe so callers can fall back to a default destination.
export function sanitizeCallbackUrl(value: string | null | undefined): string | null {
  if (typeof value !== 'string' || value.length === 0) return null;
  if (!value.startsWith('/')) return null;
  // Reject protocol-relative (//host) and backslash tricks (/\host).
  if (value.startsWith('//') || value.startsWith('/\\')) return null;
  if (value === '/login' || value.startsWith('/login?') || value.startsWith('/login/')) return null;
  return value;
}
