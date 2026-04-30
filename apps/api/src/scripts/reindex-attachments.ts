import { sql } from 'drizzle-orm';
import { db } from '@dovetail/db';
import { indexAttachmentNow } from '../services/attachment-indexing.js';

function argValue(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

async function main() {
  const attachmentId = argValue('attachmentId');
  const articleId = argValue('articleId');
  const knowledgeBaseId = argValue('knowledgeBaseId');

  const rows = await db.execute(sql`
    SELECT att.id
    FROM attachments att
    INNER JOIN articles a ON a.id = att.article_id
    INNER JOIN categories c ON c.id = a.category_id
    WHERE att.article_id IS NOT NULL
      AND (${attachmentId ?? null}::uuid IS NULL OR att.id = ${attachmentId ?? null}::uuid)
      AND (${articleId ?? null}::uuid IS NULL OR a.id = ${articleId ?? null}::uuid)
      AND (${knowledgeBaseId ?? null}::uuid IS NULL OR c.knowledge_base_id = ${knowledgeBaseId ?? null}::uuid)
    ORDER BY att.created_at ASC
  `) as Array<{ id: string }>;

  let succeeded = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      await indexAttachmentNow(row.id);
      succeeded += 1;
    } catch (err) {
      failed += 1;
      console.error('Failed to reindex attachment', row.id, err);
    }
  }

  console.log(`Attachment reindex complete. processed=${rows.length} succeeded=${succeeded} failed=${failed}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
