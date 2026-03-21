import fs from 'node:fs/promises';
import path from 'node:path';

/** Root uploads directory. Override via UPLOADS_DIR env var. */
export function getUploadsDir(): string {
  return process.env.UPLOADS_DIR ?? path.resolve(process.cwd(), 'uploads');
}

/** Ensure a directory exists, creating parent dirs as needed. */
export async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

/** Copy a file, creating the destination directory if needed. */
export async function copyFile(src: string, dest: string): Promise<void> {
  await ensureDir(path.dirname(dest));
  await fs.copyFile(src, dest);
}

/** Remove a directory recursively. No-op if it doesn't exist. */
export async function cleanupDir(dir: string): Promise<void> {
  await fs.rm(dir, { recursive: true, force: true });
}
