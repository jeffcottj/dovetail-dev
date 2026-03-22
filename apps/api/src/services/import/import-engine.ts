import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { eq, and, sql } from 'drizzle-orm';
import { db, categories, articles, attachments, importJobs } from '@dovetail/db';
import { toSlug } from '../../utils/slug.js';
import { extractText } from '../../utils/tiptap.js';
import { getUploadsDir, ensureDir, copyFile } from '../../utils/storage.js';
import { parseDataJson, buildCategoryTree, type FlowluArticle } from './flowlu-parser.js';
import { extractArticleBody, extractDateModified } from './html-extractor.js';
import { htmlToTiptap } from './html-to-tiptap.js';
import mime from 'mime-types';

export type ProgressEvent =
  | { type: 'progress'; imported: number; total: number; current: string }
  | { type: 'error'; article: string; message: string }
  | { type: 'complete'; imported: number; errors: number };

export interface ImportEngineOptions {
  extractDir: string;
  userId: string;
  defaultStatus: 'draft' | 'published';
  jobId: string;
}

export class ImportEngine {
  private opts: ImportEngineOptions;
  private listeners: ((event: ProgressEvent) => void)[] = [];
  private importedCount = 0;
  private errorCount = 0;

  constructor(opts: ImportEngineOptions) {
    this.opts = opts;
  }

  onProgress(listener: (event: ProgressEvent) => void) {
    this.listeners.push(listener);
  }

  private emit(event: ProgressEvent) {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  async run(): Promise<void> {
    // Update job status to running
    await db.update(importJobs)
      .set({ status: 'running' })
      .where(eq(importJobs.id, this.opts.jobId));

    try {
      // 1. Parse data.json
      const dataJsonPath = path.join(this.opts.extractDir, 'assets', 'data.json');
      const dataJsonContent = await fs.readFile(dataJsonPath, 'utf-8');
      const flowluArticles = parseDataJson(dataJsonContent);
      const tree = buildCategoryTree(flowluArticles);

      // Update total count
      await db.update(importJobs)
        .set({ totalArticles: flowluArticles.length })
        .where(eq(importJobs.id, this.opts.jobId));

      // 2. Create categories (depth-first, deduplicating against existing)
      const categoryMap = await this.createCategories(tree);

      // 3. Import articles
      for (const art of flowluArticles) {
        try {
          await this.importArticle(art, categoryMap);
          this.importedCount++;
          this.emit({ type: 'progress', imported: this.importedCount, total: flowluArticles.length, current: art.title });

          // Update job progress
          await db.update(importJobs)
            .set({ importedCount: this.importedCount })
            .where(eq(importJobs.id, this.opts.jobId));
        } catch (err: any) {
          this.errorCount++;
          const message = err.message ?? 'Unknown error';
          this.emit({ type: 'error', article: art.title, message });

          // Log error to job
          await db.update(importJobs)
            .set({
              errorLog: sql`${importJobs.errorLog} || ${JSON.stringify([{ article_title: art.title, error_message: message }])}::jsonb`,
            })
            .where(eq(importJobs.id, this.opts.jobId));
        }
      }

      // 4. Mark complete
      await db.update(importJobs)
        .set({ status: 'completed', completedAt: new Date() })
        .where(eq(importJobs.id, this.opts.jobId));

      this.emit({ type: 'complete', imported: this.importedCount, errors: this.errorCount });
    } catch (err: any) {
      await db.update(importJobs)
        .set({ status: 'failed', completedAt: new Date() })
        .where(eq(importJobs.id, this.opts.jobId));
      throw err;
    }
  }

  /**
   * Create categories from the tree, returning a map of sourceId → dovetailCategoryId.
   * Deduplicates: if a category with the same slug and parent already exists, reuse it.
   */
  private async createCategories(
    tree: ReturnType<typeof buildCategoryTree>,
    parentId: string | null = null,
  ): Promise<Map<string, string>> {
    const map = new Map<string, string>();

    for (const node of tree) {
      const slug = toSlug(node.name);

      // Check if category already exists at this position
      const existing = await db.select()
        .from(categories)
        .where(
          parentId
            ? and(eq(categories.slug, slug), eq(categories.parentId, parentId))
            : and(eq(categories.slug, slug), sql`${categories.parentId} IS NULL`),
        );

      let categoryId: string;
      if (existing.length > 0) {
        categoryId = existing[0].id;
      } else {
        // Create new category
        try {
          const [created] = await db.insert(categories)
            .values({ name: node.name, slug, parentId })
            .returning();
          categoryId = created.id;
        } catch (err: any) {
          if (err.code === '23505') {
            const uniqueSlug = `${slug}-${Date.now().toString(36)}`;
            const [created] = await db.insert(categories)
              .values({ name: node.name, slug: uniqueSlug, parentId })
              .returning();
            categoryId = created.id;
          } else {
            throw err;
          }
        }
      }

      map.set(node.sourceId, categoryId);

      // Recurse for children
      const childMap = await this.createCategories(node.children, categoryId);
      for (const [k, v] of childMap) {
        map.set(k, v);
      }
    }

    return map;
  }

  /**
   * Import a single article: parse HTML, convert to TipTap, insert, copy attachments.
   */
  private async importArticle(art: FlowluArticle, categoryMap: Map<string, string>): Promise<void> {
    // Determine category: use immediate parent if exists, otherwise find the top-level ancestor
    let categoryId: string | undefined;
    if (art.parentChain.length > 0) {
      const immediateParent = art.parentChain[art.parentChain.length - 1];
      categoryId = categoryMap.get(immediateParent);
    } else if (categoryMap.has(art.id)) {
      // This article IS a top-level category — place it in its own category
      categoryId = categoryMap.get(art.id);
    }

    if (!categoryId) {
      throw new Error(`No category found for article "${art.title}" (code: ${art.code})`);
    }

    // Parse HTML
    let content: any = { type: 'doc', content: [] };
    let dateModified: string | null = null;
    const htmlPath = path.join(this.opts.extractDir, 'articles', art.code, 'index.html');
    try {
      const html = await fs.readFile(htmlPath, 'utf-8');
      const bodyHtml = extractArticleBody(html);
      if (bodyHtml) {
        content = htmlToTiptap(bodyHtml);
      }
      dateModified = extractDateModified(html);
    } catch { /* no HTML file — use empty content */ }

    const plainText = extractText(content);
    const slug = art.slug || toSlug(art.title);

    // Insert article
    const now = new Date();
    const publishedAt = this.opts.defaultStatus === 'published' ? now : null;
    const createdAt = dateModified ? new Date(dateModified) : now;

    let articleId: string;

    // Check for existing article with same slug in same category
    const existing = await db.select({ id: articles.id })
      .from(articles)
      .where(and(eq(articles.slug, slug), eq(articles.categoryId, categoryId)));

    if (existing.length > 0) {
      throw new Error(`Duplicate article skipped: "${art.title}" (slug: ${slug})`);
    }

    const [created] = await db.insert(articles).values({
      title: art.title,
      slug,
      categoryId,
      authorId: this.opts.userId,
      content,
      plainText,
      status: this.opts.defaultStatus,
      createdAt,
      updatedAt: now,
      publishedAt,
    }).returning();
    articleId = created.id;

    // Copy attachments
    const imagesDir = path.join(this.opts.extractDir, 'assets', 'images', art.id);
    try {
      const files = await fs.readdir(imagesDir);
      for (const file of files) {
        const srcPath = path.join(imagesDir, file);
        const stat = await fs.stat(srcPath);
        if (!stat.isFile()) continue;

        const attachmentId = randomUUID();
        const ext = path.extname(file);
        const storagePath = path.join('uploads', 'attachments', `${attachmentId}${ext}`);
        const destPath = path.join(getUploadsDir(), 'attachments', `${attachmentId}${ext}`);

        await copyFile(srcPath, destPath);

        await db.insert(attachments).values({
          id: attachmentId,
          articleId,
          filename: file,
          storagePath,
          mimeType: mime.lookup(file) || 'application/octet-stream',
          sizeBytes: stat.size,
        });
      }
    } catch { /* no images directory for this article */ }
  }
}
