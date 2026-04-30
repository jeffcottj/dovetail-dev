import { describe, expect, it } from 'vitest';
import { fileTypeLabel, formatFileSize } from './AttachmentList';

describe('AttachmentList helpers', () => {
  it('formats byte sizes compactly', () => {
    expect(formatFileSize(512)).toBe('512 B');
    expect(formatFileSize(1536)).toBe('1.5 KB');
    expect(formatFileSize(2 * 1024 * 1024)).toBe('2.0 MB');
  });

  it('uses friendly labels for known and unknown MIME types', () => {
    expect(fileTypeLabel('application/pdf')).toBe('PDF');
    expect(fileTypeLabel('text/plain')).toBe('PLAIN');
  });
});
