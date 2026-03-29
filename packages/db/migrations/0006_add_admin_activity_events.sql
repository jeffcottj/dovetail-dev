-- Admin activity events table

CREATE TABLE admin_activity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  actor_id uuid NOT NULL REFERENCES users(id),
  knowledge_base_id uuid REFERENCES knowledge_bases(id) ON DELETE SET NULL,
  subject_id text NOT NULL,
  subject_label text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now()
);
