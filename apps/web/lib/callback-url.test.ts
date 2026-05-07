import { describe, it, expect } from 'vitest';
import { sanitizeCallbackUrl } from './callback-url';

describe('sanitizeCallbackUrl', () => {
  it('accepts ordinary same-origin paths', () => {
    expect(sanitizeCallbackUrl('/kb/housing/articles/eviction')).toBe('/kb/housing/articles/eviction');
    expect(sanitizeCallbackUrl('/admin')).toBe('/admin');
    expect(sanitizeCallbackUrl('/foo?bar=baz#frag')).toBe('/foo?bar=baz#frag');
  });

  it('rejects empty, null, undefined', () => {
    expect(sanitizeCallbackUrl(null)).toBeNull();
    expect(sanitizeCallbackUrl(undefined)).toBeNull();
    expect(sanitizeCallbackUrl('')).toBeNull();
  });

  it('rejects absolute URLs and external hosts', () => {
    expect(sanitizeCallbackUrl('https://evil.com')).toBeNull();
    expect(sanitizeCallbackUrl('http://evil.com/path')).toBeNull();
    expect(sanitizeCallbackUrl('javascript:alert(1)')).toBeNull();
  });

  it('rejects protocol-relative and backslash bypasses', () => {
    expect(sanitizeCallbackUrl('//evil.com')).toBeNull();
    expect(sanitizeCallbackUrl('//evil.com/path')).toBeNull();
    expect(sanitizeCallbackUrl('/\\evil.com')).toBeNull();
  });

  it('rejects /login to avoid redirect loops', () => {
    expect(sanitizeCallbackUrl('/login')).toBeNull();
    expect(sanitizeCallbackUrl('/login?callbackUrl=/foo')).toBeNull();
    expect(sanitizeCallbackUrl('/login/whatever')).toBeNull();
  });

  it('rejects values that do not start with /', () => {
    expect(sanitizeCallbackUrl('foo')).toBeNull();
    expect(sanitizeCallbackUrl('relative/path')).toBeNull();
  });
});
