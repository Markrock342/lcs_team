-- Limit Code Team Management Schema
-- Run this in Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Team profiles (linked to auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('pm', 'backend', 'design')),
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Clients
CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  contact_name TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  company TEXT,
  project_type TEXT NOT NULL DEFAULT 'other' CHECK (project_type IN (
    'mobile_app', 'web_app', 'website', 'system', 'design', 'maintenance', 'consulting', 'other'
  )),
  description TEXT,
  budget DECIMAL(12,2),
  notes TEXT,
  image_url TEXT,
  repo_url TEXT,
  supabase_url TEXT,
  figma_url TEXT,
  staging_url TEXT,
  production_url TEXT,
  docs_url TEXT,
  drive_url TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('lead', 'active', 'completed', 'paused')),
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tasks / Work items
CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  parent_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'waiting', 'in_progress', 'review', 'done'
  )),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  assigned_to UUID REFERENCES profiles(id),
  start_date DATE,
  due_date DATE,
  duration_days INTEGER DEFAULT 1,
  progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  image_url TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Chat channels (Discord-style)
CREATE TABLE IF NOT EXISTS channels (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Team chat messages
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content TEXT,
  file_url TEXT,
  file_name TEXT,
  file_type TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_client ON tasks(client_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_clients_status ON clients(status);
CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel_id);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_channels_name ON channels(name);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER clients_updated_at BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER tasks_updated_at BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  base_username TEXT;
  final_username TEXT;
BEGIN
  base_username := COALESCE(
    NEW.raw_user_meta_data->>'username',
    split_part(NEW.email, '@', 1)
  );

  final_username := base_username;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE username = final_username) THEN
    final_username := base_username || '_' || substr(NEW.id::text, 1, 8);
  END IF;

  INSERT INTO public.profiles (id, username, display_name, role)
  VALUES (
    NEW.id,
    final_username,
    COALESCE(NEW.raw_user_meta_data->>'display_name', base_username),
    COALESCE(NEW.raw_user_meta_data->>'role', 'pm')
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Profiles: team members can read all, update own, insert own
CREATE POLICY "Team can view profiles" ON profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

-- Clients: full access for authenticated team
CREATE POLICY "Team can view clients" ON clients FOR SELECT TO authenticated USING (true);
CREATE POLICY "Team can insert clients" ON clients FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Team can update clients" ON clients FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Team can delete clients" ON clients FOR DELETE TO authenticated USING (true);

-- Tasks: full access for authenticated team
CREATE POLICY "Team can view tasks" ON tasks FOR SELECT TO authenticated USING (true);
CREATE POLICY "Team can insert tasks" ON tasks FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Team can update tasks" ON tasks FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Team can delete tasks" ON tasks FOR DELETE TO authenticated USING (true);

-- Channels: full access for authenticated team
CREATE POLICY "Team can view channels" ON channels FOR SELECT TO authenticated USING (true);
CREATE POLICY "Team can create channels" ON channels FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Team can update channels" ON channels FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Team can delete channels" ON channels FOR DELETE TO authenticated USING (true);

-- Messages: full access for authenticated team
CREATE POLICY "Team can view messages" ON messages FOR SELECT TO authenticated USING (true);
CREATE POLICY "Team can send messages" ON messages FOR INSERT TO authenticated WITH CHECK (auth.uid() = sender_id);
CREATE POLICY "Team can delete own messages" ON messages FOR DELETE TO authenticated USING (auth.uid() = sender_id);

-- Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE channels;
ALTER PUBLICATION supabase_realtime ADD TABLE messages;

-- Default channels
INSERT INTO channels (name, description) VALUES
  ('general', 'แชททั่วไปของทีม'),
  ('dev', 'คุยงาน dev / code'),
  ('design', 'UI/UX และ frontend'),
  ('random', 'คุยเล่น ไม่เกี่ยวงาน')
ON CONFLICT (name) DO NOTHING;

-- Storage buckets (run in Supabase Dashboard > Storage or via SQL)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('uploads', 'uploads', true);

-- Storage policies (after creating bucket 'uploads')
-- CREATE POLICY "Authenticated upload" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'uploads');
-- CREATE POLICY "Public read uploads" ON storage.objects FOR SELECT TO public USING (bucket_id = 'uploads');
-- CREATE POLICY "Authenticated delete own" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'uploads' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Seed team members (create users in Supabase Auth first, then update profiles)
-- UPDATE profiles SET display_name = 'Mark', role = 'pm', username = 'mark' WHERE username = 'mark';
-- UPDATE profiles SET display_name = 'Knott', role = 'backend', username = 'knott' WHERE username = 'knott';
-- UPDATE profiles SET display_name = 'Bank', role = 'design', username = 'bank' WHERE username = 'bank';
