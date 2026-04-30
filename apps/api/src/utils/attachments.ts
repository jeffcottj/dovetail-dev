import path from 'node:path';
import { getUploadsDir } from './storage.js';

const LEGACY_UPLOADS_PREFIX = 'uploads/';

export function resolveAttachmentPath(storagePath: string): string {
  const relativePath = storagePath.startsWith(LEGACY_UPLOADS_PREFIX)
    ? storagePath.slice(LEGACY_UPLOADS_PREFIX.length)
    : storagePath;
  const uploadsRoot = path.resolve(getUploadsDir());
  const absolutePath = path.resolve(uploadsRoot, relativePath);

  if (absolutePath !== uploadsRoot && !absolutePath.startsWith(`${uploadsRoot}${path.sep}`)) {
    throw new Error('Invalid attachment storage path');
  }

  return absolutePath;
}
