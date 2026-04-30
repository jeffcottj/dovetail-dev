import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { eq, and, sql } from 'drizzle-orm';
import { db, categories, articles, attachments, importJobs, tags, articleTags } from '@dovetail/db';
import { toSlug } from '../../utils/slug.js';
import { extractText } from '../../utils/tiptap.js';
import { getUploadsDir, ensureDir, copyFile } from '../../utils/storage.js';
import { parseDataJson, buildCategoryTree, type FlowluArticle } from './flowlu-parser.js';
import { extractArticleBody, extractDateModified } from './html-extractor.js';
import { htmlToTiptap } from './html-to-tiptap.js';
import { enqueueAttachmentIndexing } from '../attachment-indexing.js';
import { generateEmbeddings } from '../embedding-pipeline.js';
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
  knowledgeBaseId: string;
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

  private async appendJobLog(entry: { article_title: string; error_message: string }) {
    await db.update(importJobs)
      .set({
        errorLog: sql`${importJobs.errorLog} || ${JSON.stringify([entry])}::jsonb`,
      })
      .where(eq(importJobs.id, this.opts.jobId));
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
          await this.appendJobLog({ article_title: art.title, error_message: message });
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
            ? and(eq(categories.slug, slug), eq(categories.parentId, parentId), eq(categories.knowledgeBaseId, this.opts.knowledgeBaseId))
            : and(eq(categories.slug, slug), sql`${categories.parentId} IS NULL`, eq(categories.knowledgeBaseId, this.opts.knowledgeBaseId)),
        );

      let categoryId: string;
      if (existing.length > 0) {
        categoryId = existing[0].id;
      } else {
        // Create new category
        try {
          const [created] = await db.insert(categories)
            .values({ name: node.name, slug, parentId, knowledgeBaseId: this.opts.knowledgeBaseId })
            .returning();
          categoryId = created.id;
        } catch (err: any) {
          if (err.code === '23505') {
            const uniqueSlug = `${slug}-${Date.now().toString(36)}`;
            const [created] = await db.insert(categories)
              .values({ name: node.name, slug: uniqueSlug, parentId, knowledgeBaseId: this.opts.knowledgeBaseId })
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

  private normalizedTagNames(tagNames: string[]): string[] {
    const seen = new Set<string>();
    const normalized: string[] = [];

    for (const rawName of tagNames) {
      const name = rawName.trim();
      const key = name.toLocaleLowerCase();
      if (!name || seen.has(key)) {
        continue;
      }
      seen.add(key);
      normalized.push(name);
    }

    return normalized;
  }

  private async findTag(name: string, slug: string): Promise<string | null> {
    const existing = await db.select({ id: tags.id })
      .from(tags)
      .where(sql`
        ${tags.knowledgeBaseId} = ${this.opts.knowledgeBaseId}
        AND (
          lower(${tags.name}) = lower(${name})
          OR lower(${tags.slug}) = lower(${slug})
        )
      `)
      .limit(1);

    return existing[0]?.id ?? null;
  }

  private async getOrCreateTagId(name: string): Promise<string> {
    const slug = toSlug(name);
    const existingId = await this.findTag(name, slug);
    if (existingId) {
      return existingId;
    }

    try {
      const [created] = await db.insert(tags)
        .values({ name, slug, knowledgeBaseId: this.opts.knowledgeBaseId })
        .returning({ id: tags.id });
      return created.id;
    } catch (err: any) {
      if (err.code === '23505') {
        const racedId = await this.findTag(name, slug);
        if (racedId) {
          return racedId;
        }
      }
      throw err;
    }
  }

  private async assignTags(articleId: string, tagNames: string[]): Promise<void> {
    const normalized = this.normalizedTagNames(tagNames);
    if (normalized.length === 0) {
      return;
    }

    for (const name of normalized) {
      const tagId = await this.getOrCreateTagId(name);
      await db.insert(articleTags)
        .values({ articleId, tagId })
        .onConflictDoNothing();
    }
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
      lastEditedById: this.opts.userId,
      content,
      plainText,
      status: this.opts.defaultStatus,
      createdAt,
      updatedAt: now,
      publishedAt,
    }).returning();
    articleId = created.id;

    await this.assignTags(articleId, art.tags);

    try {
      await generateEmbeddings(articleId);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Embedding generation failed';
      await this.appendJobLog({
        article_title: art.title,
        error_message: `Article embedding generation failed: ${message}`,
      });
    }

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
          extractionStatus: 'pending',
        });
        enqueueAttachmentIndexing(attachmentId);
      }
    } catch { /* no images directory for this article */ }
  }
}
