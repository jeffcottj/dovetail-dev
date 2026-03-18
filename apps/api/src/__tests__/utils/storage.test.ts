import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { getUploadsDir, ensureDir, copyFile, cleanupDir } from '../../utils/storage.js';

describe('storage utils', () => {
  let tempBase: string;

  beforeEach(() => {
    tempBase = fs.mkdtempSync(path.join(os.tmpdir(), 'dovetail-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempBase, { recursive: true, force: true });
  });

  describe('ensureDir', () => {
    it('creates nested directories', async () => {
      const dir = path.join(tempBase, 'a', 'b', 'c');
      await ensureDir(dir);
      expect(fs.existsSync(dir)).toBe(true);
    });

    it('is idempotent', async () => {
      const dir = path.join(tempBase, 'exists');
      await ensureDir(dir);
      await ensureDir(dir); // no throw
      expect(fs.existsSync(dir)).toBe(true);
    });
  });

  describe('copyFile', () => {
    it('copies a file to the target path', async () => {
      const src = path.join(tempBase, 'source.txt');
      const dest = path.join(tempBase, 'out', 'dest.txt');
      fs.writeFileSync(src, 'hello');
      await copyFile(src, dest);
      expect(fs.readFileSync(dest, 'utf-8')).toBe('hello');
    });
  });

  describe('cleanupDir', () => {
    it('removes a directory and its contents', async () => {
      const dir = path.join(tempBase, 'cleanup-me');
      fs.mkdirSync(dir);
      fs.writeFileSync(path.join(dir, 'file.txt'), 'data');
      await cleanupDir(dir);
      expect(fs.existsSync(dir)).toBe(false);
    });

    it('does not throw if directory does not exist', async () => {
      await cleanupDir(path.join(tempBase, 'nope'));
    });
  });
});
