import { describe, expect, it, vi } from 'vitest';

vi.mock('@dovetail/db', () => ({
  db: { execute: vi.fn() },
}));

import type { Response } from 'express';
import { requireRole } from '../../middleware/requireRole.js';
import type { AuthRequest } from '../../middleware/auth.js';

describe('requireRole', () => {
  function callMiddleware(role: string, minimum: string) {
    const req = { user: { id: 'u1', role } } as AuthRequest;
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as unknown as Response;
    const next = vi.fn();
    requireRole(minimum as any)(req, res, next);
    return { req, res, next };
  }

  it('returns 403 for viewer on editor route', () => {
    const { res, next } = callMiddleware('viewer', 'editor');
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('allows editor on editor route', () => {
    const { next } = callMiddleware('editor', 'editor');
    expect(next).toHaveBeenCalled();
  });

  it('allows admin on editor route', () => {
    const { next } = callMiddleware('admin', 'editor');
    expect(next).toHaveBeenCalled();
  });

  it('returns 403 when no user on request', () => {
    const req = {} as AuthRequest;
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as unknown as Response;
    const next = vi.fn();
    requireRole('viewer')(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
