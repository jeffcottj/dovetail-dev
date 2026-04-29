ALTER TABLE articles
  ADD COLUMN last_edited_by_id uuid;

UPDATE articles
SET last_edited_by_id = author_id
WHERE last_edited_by_id IS NULL;

ALTER TABLE articles
  ALTER COLUMN last_edited_by_id SET NOT NULL;

ALTER TABLE articles
  ADD CONSTRAINT articles_last_edited_by_id_users_id_fk
  FOREIGN KEY (last_edited_by_id) REFERENCES users(id);
