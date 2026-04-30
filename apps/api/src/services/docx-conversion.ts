import fs from 'node:fs/promises';
import path from 'node:path';
import mammoth from 'mammoth';
import { htmlToTiptap } from './import/html-to-tiptap.js';
import { extractText } from '../utils/tiptap.js';
import type { DocxConversionResult } from '@dovetail/types';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const ZIP_SIGNATURES = new Set(['504b0304', '504b0506', '504b0708']);

export class DocxConversionError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 400,
  ) {
    super(message);
    this.name = 'DocxConversionError';
  }
}

export function isAllowedDocxUpload(file: { originalname: string; mimetype?: string }) {
  const ext = path.extname(file.originalname).toLowerCase();
  const mimeType = (file.mimetype ?? '').toLowerCase();

  return ext === '.docx' && (
    mimeType === DOCX_MIME ||
    mimeType === 'application/octet-stream' ||
    mimeType === 'application/zip' ||
    mimeType === ''
  );
}

function sanitizeWarning(message: string): string {
  return message.replace(/\s+/g, ' ').trim().slice(0, 300);
}

function collectSuggestedTitle(node: unknown): string | undefined {
  if (!node || typeof node !== 'object') return undefined;
  const current = node as Record<string, unknown>;

  if (current.type === 'heading') {
    const text = extractText(current).trim();
    if (text) return text.slice(0, 500);
  }

  if (Array.isArray(current.content)) {
    for (const child of current.content) {
      const title = collectSuggestedTitle(child);
      if (title) return title;
    }
  }

  return undefined;
}

async function assertDocxPackage(buffer: Buffer) {
  const signature = buffer.subarray(0, 4).toString('hex');
  if (!ZIP_SIGNATURES.has(signature)) {
    throw new DocxConversionError('Uploaded file is not a valid DOCX document');
  }

  const asBinary = buffer.toString('latin1');
  if (!asBinary.includes('word/')) {
    throw new DocxConversionError('Uploaded file is not a valid DOCX document');
  }
}

export async function convertDocxBuffer(buffer: Buffer): Promise<DocxConversionResult> {
  await assertDocxPackage(buffer);

  const warnings: string[] = [];
  const result = await mammoth.convertToHtml(
    { buffer },
    {
      convertImage: mammoth.images.imgElement(async () => {
        warnings.push('Embedded images were not imported.');
        return { src: '', alt: '' };
      }),
    },
  );

  for (const message of result.messages ?? []) {
    const warning = sanitizeWarning(message.message);
    if (warning) warnings.push(warning);
  }

  const htmlWithoutEmptyImages = result.value.replace(/<img\b[^>]*src=["']?["']?[^>]*>/gi, '');
  const content = htmlToTiptap(htmlWithoutEmptyImages);
  const plainText = extractText(content).replace(/\s+/g, ' ').trim();
  const suggestedTitle = collectSuggestedTitle(content);

  return {
    content,
    plainText,
    suggestedTitle,
    warnings: Array.from(new Set(warnings)),
  };
}

export async function convertDocxFile(filePath: string): Promise<DocxConversionResult> {
  const buffer = await fs.readFile(filePath);
  return convertDocxBuffer(buffer);
}
