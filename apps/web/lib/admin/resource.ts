import { apiFetch } from '../api';

export interface AdminResourceSuccess<T> {
  ok: true;
  data: T;
}

export interface AdminResourceNotFound {
  ok: false;
  kind: 'not_found';
  error: string;
}

export interface AdminResourceFailure {
  ok: false;
  kind: 'error';
  error: string;
}

export type AdminResourceResult<T> = AdminResourceSuccess<T> | AdminResourceNotFound | AdminResourceFailure;

function readErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Failed to load admin data';
}

function isNotFoundError(error: unknown): boolean {
  return error instanceof Error && /^API error: 404\b/.test(error.message);
}

export async function fetchAdminResource<T>(path: string): Promise<AdminResourceResult<T>> {
  try {
    return {
      ok: true,
      data: await apiFetch<T>(path),
    };
  } catch (error) {
    const message = readErrorMessage(error);
    if (isNotFoundError(error)) {
      return {
        ok: false,
        kind: 'not_found',
        error: message,
      };
    }

    return {
      ok: false,
      kind: 'error',
      error: message,
    };
  }
}
