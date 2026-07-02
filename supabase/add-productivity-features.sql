-- Productivity features: checklist, chat reactions, portal feedback, search indexes
-- รันใน Supabase SQL Editor (รันซ้ำได้)

-- ========== TASK CHECKLIST ==========
CREATE TABLE IF NOT EXISTS task_checklist_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  done BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_checklist_task ON task_checklist_items(task_id, sort_order);

ALTER TABLE task_checklist_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Team checklist" ON task_checklist_items;
CREATE POLICY "Team checklist" ON task_checklist_items
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ========== CHAT REACTIONS + TASK LINKS ==========
ALTER TABLE messages ADD COLUMN IF NOT EXISTS linked_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS message_reactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(message_id, user_id, emoji)
);
CREATE INDEX IF NOT EXISTS idx_message_reactions_msg ON message_reactions(message_id);

ALTER TABLE message_reactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Team reactions" ON message_reactions;
CREATE POLICY "Team reactions" ON message_reactions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ========== PORTAL COMMENTS & FEEDBACK ==========
CREATE TABLE IF NOT EXISTS portal_comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  author_name TEXT NOT NULL,
  content TEXT NOT NULL,
  task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_portal_comments_client ON portal_comments(client_id, created_at DESC);

CREATE TABLE IF NOT EXISTS portal_task_feedback (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  author_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'comment'
    CHECK (status IN ('approved', 'changes_requested', 'comment')),
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_portal_feedback_task ON portal_task_feedback(task_id, created_at DESC);

-- ========== SEARCH INDEXES ==========
CREATE INDEX IF NOT EXISTS idx_tasks_title_search ON tasks USING gin (to_tsvector('simple', title));
CREATE INDEX IF NOT EXISTS idx_clients_name_search ON clients USING gin (to_tsvector('simple', name));

-- ========== PORTAL RPC (extended) ==========
CREATE OR REPLACE FUNCTION get_portal_data(token UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSON;
  cid UUID;
BEGIN
  SELECT id INTO cid FROM clients WHERE portal_token = token AND portal_enabled = TRUE;
  IF cid IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT json_build_object(
    'client', (SELECT row_to_json(c) FROM (
      SELECT id, name, company, project_type, status, description FROM clients WHERE id = cid
    ) c),
    'tasks', (SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.start_date NULLS LAST), '[]'::json) FROM (
      SELECT id, title, status, progress, start_date, due_date, duration_days
      FROM tasks WHERE client_id = cid AND parent_id IS NULL
    ) t),
    'invoices', (SELECT COALESCE(json_agg(row_to_json(i)), '[]'::json) FROM (
      SELECT title, total_amount, status, due_date FROM invoices WHERE client_id = cid
    ) i),
    'files', (SELECT COALESCE(json_agg(row_to_json(f) ORDER BY f.created_at DESC), '[]'::json) FROM (
      SELECT name, file_url, file_type, created_at FROM client_files WHERE client_id = cid
    ) f),
    'comments', (SELECT COALESCE(json_agg(row_to_json(pc) ORDER BY pc.created_at DESC), '[]'::json) FROM (
      SELECT author_name, content, task_id, created_at FROM portal_comments WHERE client_id = cid
      LIMIT 50
    ) pc),
    'feedback', (SELECT COALESCE(json_agg(row_to_json(pf) ORDER BY pf.created_at DESC), '[]'::json) FROM (
      SELECT task_id, author_name, status, comment, created_at FROM portal_task_feedback WHERE client_id = cid
      LIMIT 50
    ) pf)
  ) INTO result;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_portal_data(UUID) TO anon, authenticated;

CREATE OR REPLACE FUNCTION post_portal_comment(
  token UUID,
  author_name TEXT,
  content TEXT,
  p_task_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cid UUID;
  new_id UUID;
BEGIN
  SELECT id INTO cid FROM clients WHERE portal_token = token AND portal_enabled = TRUE;
  IF cid IS NULL THEN
    RAISE EXCEPTION 'invalid portal';
  END IF;

  INSERT INTO portal_comments (client_id, author_name, content, task_id)
  VALUES (cid, trim(author_name), trim(content), p_task_id)
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION post_portal_comment(UUID, TEXT, TEXT, UUID) TO anon, authenticated;

CREATE OR REPLACE FUNCTION post_portal_task_feedback(
  token UUID,
  p_task_id UUID,
  author_name TEXT,
  p_status TEXT,
  p_comment TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cid UUID;
  new_id UUID;
BEGIN
  SELECT id INTO cid FROM clients WHERE portal_token = token AND portal_enabled = TRUE;
  IF cid IS NULL THEN
    RAISE EXCEPTION 'invalid portal';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM tasks WHERE id = p_task_id AND client_id = cid) THEN
    RAISE EXCEPTION 'invalid task';
  END IF;

  INSERT INTO portal_task_feedback (client_id, task_id, author_name, status, comment)
  VALUES (cid, p_task_id, trim(author_name), p_status, nullif(trim(p_comment), ''))
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION post_portal_task_feedback(UUID, UUID, TEXT, TEXT, TEXT) TO anon, authenticated;
