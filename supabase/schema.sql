  -- Limit Code Team Management Schema
  -- Run this in Supabase SQL Editor (รันซ้ำได้ — idempotent)

  CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

  -- ========== TABLES ==========
  CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'pm',
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS clients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    contact_name TEXT,
    contact_phone TEXT,
    contact_email TEXT,
    company TEXT,
    project_type TEXT NOT NULL DEFAULT 'other',
    description TEXT,
    budget DECIMAL(12,2),
    notes TEXT,
    image_url TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    priority TEXT NOT NULL DEFAULT 'medium',
    assigned_to UUID REFERENCES profiles(id),
    start_date DATE,
    due_date DATE,
    duration_days INTEGER DEFAULT 1,
    progress INTEGER DEFAULT 0,
    image_url TEXT,
    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS channels (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sender_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    content TEXT,
    file_url TEXT,
    file_name TEXT,
    file_type TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  -- ========== SYNC COLUMNS (กรณีรัน schema เก่าไปแล้ว) ==========
  ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
  ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
    CHECK (role IN ('admin', 'pm', 'backend', 'design'));

  ALTER TABLE clients ADD COLUMN IF NOT EXISTS repo_url TEXT;
  ALTER TABLE clients ADD COLUMN IF NOT EXISTS supabase_url TEXT;
  ALTER TABLE clients ADD COLUMN IF NOT EXISTS figma_url TEXT;
  ALTER TABLE clients ADD COLUMN IF NOT EXISTS staging_url TEXT;
  ALTER TABLE clients ADD COLUMN IF NOT EXISTS production_url TEXT;
  ALTER TABLE clients ADD COLUMN IF NOT EXISTS docs_url TEXT;
  ALTER TABLE clients ADD COLUMN IF NOT EXISTS drive_url TEXT;

  ALTER TABLE tasks ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES tasks(id) ON DELETE CASCADE;

  ALTER TABLE messages ADD COLUMN IF NOT EXISTS channel_id UUID REFERENCES channels(id) ON DELETE CASCADE;

  -- ย้ายข้อความเก่าไป #general (ถ้ามี)
  INSERT INTO channels (name, description) VALUES
    ('general', 'แชททั่วไปของทีม')
  ON CONFLICT (name) DO NOTHING;

  UPDATE messages
  SET channel_id = (SELECT id FROM channels WHERE name = 'general' LIMIT 1)
  WHERE channel_id IS NULL;

  -- ========== INDEXES ==========
  CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_id);
  CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
  CREATE INDEX IF NOT EXISTS idx_tasks_client ON tasks(client_id);
  CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON tasks(assigned_to);
  CREATE INDEX IF NOT EXISTS idx_clients_status ON clients(status);
  CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel_id);
  CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_channels_name ON channels(name);

  -- ========== TRIGGERS ==========
  CREATE OR REPLACE FUNCTION update_updated_at()
  RETURNS TRIGGER AS $$
  BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
  END;
  $$ LANGUAGE plpgsql;

  DROP TRIGGER IF EXISTS clients_updated_at ON clients;
  CREATE TRIGGER clients_updated_at BEFORE UPDATE ON clients
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

  DROP TRIGGER IF EXISTS tasks_updated_at ON tasks;
  CREATE TRIGGER tasks_updated_at BEFORE UPDATE ON tasks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

  CREATE OR REPLACE FUNCTION public.handle_new_user()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $$
  DECLARE
    base_username TEXT;
    final_username TEXT;
    assigned_role TEXT;
  BEGIN
    base_username := COALESCE(
      NEW.raw_user_meta_data->>'username',
      split_part(NEW.email, '@', 1)
    );

    final_username := base_username;
    IF EXISTS (SELECT 1 FROM public.profiles WHERE username = final_username) THEN
      final_username := base_username || '_' || substr(NEW.id::text, 1, 8);
    END IF;

    assigned_role := CASE
      WHEN lower(NEW.email) = 'markrock342@gmail.com' THEN 'admin'
      ELSE COALESCE(NEW.raw_user_meta_data->>'role', 'pm')
    END;

    INSERT INTO public.profiles (id, username, display_name, role)
    VALUES (
      NEW.id,
      final_username,
      COALESCE(NEW.raw_user_meta_data->>'display_name', base_username),
      assigned_role
    );

    RETURN NEW;
  END;
  $$;

  DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
  CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

  -- ========== RLS ==========
  ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
  ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
  ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
  ALTER TABLE channels ENABLE ROW LEVEL SECURITY;
  ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS "Team can view profiles" ON profiles;
  CREATE POLICY "Team can view profiles" ON profiles FOR SELECT TO authenticated USING (true);
  DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
  CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
  DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
  CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

  DROP POLICY IF EXISTS "Team can view clients" ON clients;
  CREATE POLICY "Team can view clients" ON clients FOR SELECT TO authenticated USING (true);
  DROP POLICY IF EXISTS "Team can insert clients" ON clients;
  CREATE POLICY "Team can insert clients" ON clients FOR INSERT TO authenticated WITH CHECK (true);
  DROP POLICY IF EXISTS "Team can update clients" ON clients;
  CREATE POLICY "Team can update clients" ON clients FOR UPDATE TO authenticated USING (true);
  DROP POLICY IF EXISTS "Team can delete clients" ON clients;
  CREATE POLICY "Team can delete clients" ON clients FOR DELETE TO authenticated USING (true);

  DROP POLICY IF EXISTS "Team can view tasks" ON tasks;
  CREATE POLICY "Team can view tasks" ON tasks FOR SELECT TO authenticated USING (true);
  DROP POLICY IF EXISTS "Team can insert tasks" ON tasks;
  CREATE POLICY "Team can insert tasks" ON tasks FOR INSERT TO authenticated WITH CHECK (true);
  DROP POLICY IF EXISTS "Team can update tasks" ON tasks;
  CREATE POLICY "Team can update tasks" ON tasks FOR UPDATE TO authenticated USING (true);
  DROP POLICY IF EXISTS "Team can delete tasks" ON tasks;
  CREATE POLICY "Team can delete tasks" ON tasks FOR DELETE TO authenticated USING (true);

  DROP POLICY IF EXISTS "Team can view channels" ON channels;
  CREATE POLICY "Team can view channels" ON channels FOR SELECT TO authenticated USING (true);
  DROP POLICY IF EXISTS "Team can create channels" ON channels;
  CREATE POLICY "Team can create channels" ON channels FOR INSERT TO authenticated WITH CHECK (true);
  DROP POLICY IF EXISTS "Team can update channels" ON channels;
  CREATE POLICY "Team can update channels" ON channels FOR UPDATE TO authenticated USING (true);
  DROP POLICY IF EXISTS "Team can delete channels" ON channels;
  CREATE POLICY "Team can delete channels" ON channels FOR DELETE TO authenticated USING (true);

  DROP POLICY IF EXISTS "Team can view messages" ON messages;
  CREATE POLICY "Team can view messages" ON messages FOR SELECT TO authenticated USING (true);
  DROP POLICY IF EXISTS "Team can send messages" ON messages;
  CREATE POLICY "Team can send messages" ON messages FOR INSERT TO authenticated WITH CHECK (auth.uid() = sender_id);
  DROP POLICY IF EXISTS "Team can delete own messages" ON messages;
  CREATE POLICY "Team can delete own messages" ON messages FOR DELETE TO authenticated USING (auth.uid() = sender_id);

  -- ========== REALTIME ==========
  DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE channels;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END $$;

  DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE messages;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END $$;

  -- ========== SEED CHANNELS ==========
  INSERT INTO channels (name, description) VALUES
    ('general', 'แชททั่วไปของทีม'),
    ('dev', 'คุยงาน dev / code'),
    ('design', 'UI/UX และ frontend'),
    ('random', 'คุยเล่น ไม่เกี่ยวงาน')
  ON CONFLICT (name) DO NOTHING;

-- Storage bucket + policies → รัน supabase/storage-uploads.sql
