export type ApiErrorKind =
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'validation'
  | 'upstream'
  | 'network';

export class ApiClientError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number | null;
  readonly details: unknown;

  constructor(kind: ApiErrorKind, message: string, status: number | null = null, details: unknown = null) {
    super(message);
    this.name = 'ApiClientError';
    this.kind = kind;
    this.status = status;
    this.details = details;
  }
}

export function mapStatusToKind(status: number): ApiErrorKind {
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status === 400 || status === 422) return 'validation';
  return 'upstream';
}

export function defaultMessageForKind(kind: ApiErrorKind, fallback?: string): string {
  switch (kind) {
    case 'unauthorized':
      return 'Dovetail API key is missing, invalid, or revoked.';
    case 'forbidden':
      return 'Dovetail API key does not have access to the requested knowledge base.';
    case 'not_found':
      return 'Article or resource was not found, is unpublished, or is outside the API key scope.';
    case 'validation':
      return fallback ?? 'Request failed validation.';
    case 'upstream':
      return fallback ?? 'Dovetail API returned an unexpected error.';
    case 'network':
      return fallback ?? 'Could not reach the Dovetail API.';
  }
}
