BEGIN;

-- Preconditions are verified against the target database before provisioning.
-- Never remove an auth foreign key or silently adopt an existing human account.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint con JOIN pg_attribute col
      ON col.attrelid=con.conrelid AND col.attnum=ANY(con.conkey)
    WHERE con.conrelid='public.profiles'::regclass AND con.contype='f' AND col.attname='id'
  ) THEN
    RAISE EXCEPTION 'profiles.id has an auth foreign key. Review target schema and provision a dedicated non-login auth identity before applying this migration; no auth constraint will be changed.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE username='secretary-kim') AND NOT EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='workspace_bots'
  ) THEN
    RAISE EXCEPTION 'secretary-kim already exists; refusing to adopt or rename a human profile';
  END IF;
END $$;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS account_type text NOT NULL DEFAULT 'HUMAN' CHECK (account_type IN ('HUMAN','BOT'));
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS bot_description text;
CREATE TABLE IF NOT EXISTS public.workspace_bots (
  slug text PRIMARY KEY,
  profile_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id),
  enabled boolean NOT NULL DEFAULT false
);
DO $$
DECLARE bot_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.workspace_bots WHERE slug='secretary-kim') THEN
    IF EXISTS (SELECT 1 FROM public.profiles WHERE username='secretary-kim') THEN
      RAISE EXCEPTION 'Refusing to adopt existing secretary-kim profile';
    END IF;
    bot_id := gen_random_uuid();
    INSERT INTO public.profiles (id,username,display_name,role,account_type,bot_description,notify_chat,notify_mentions,notify_tasks,push_enabled)
    VALUES (bot_id,'secretary-kim','เลขาคิม','guest','BOT','AI Assistant — Limit Code Studio',false,false,false,false);
    INSERT INTO public.workspace_bots (slug,profile_id,enabled) VALUES ('secretary-kim',bot_id,false);
  END IF;
END $$;
CREATE TABLE IF NOT EXISTS public.workspace_bot_channels (
  bot_user_id uuid NOT NULL REFERENCES public.profiles(id),
  channel_id uuid NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  granted_by uuid NOT NULL REFERENCES public.profiles(id),
  granted_at timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (bot_user_id,channel_id)
);
CREATE TABLE IF NOT EXISTS public.mcp_message_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid NOT NULL REFERENCES public.profiles(id),
  bot_user_id uuid NOT NULL REFERENCES public.profiles(id),
  channel_id uuid NOT NULL REFERENCES public.channels(id),
  idempotency_key text NOT NULL,
  content text NOT NULL CHECK (length(content) BETWEEN 1 AND 4000),
  content_hash text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','denied','sent')),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  expires_at timestamptz NOT NULL DEFAULT (NOW()+INTERVAL '15 minutes'),
  approved_at timestamptz,
  message_id uuid REFERENCES public.messages(id),
  sent_at timestamptz,
  UNIQUE (actor_user_id,idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_mcp_message_requests_actor_created ON public.mcp_message_requests(actor_user_id,created_at DESC);
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES public.profiles(id);
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS bot_request_id uuid UNIQUE REFERENCES public.mcp_message_requests(id);
ALTER TABLE public.mcp_audit_logs ADD COLUMN IF NOT EXISTS actor_user_id uuid REFERENCES public.profiles(id);
ALTER TABLE public.mcp_audit_logs ADD COLUMN IF NOT EXISTS bot_user_id uuid REFERENCES public.profiles(id);
ALTER TABLE public.mcp_audit_logs ADD COLUMN IF NOT EXISTS channel_id uuid REFERENCES public.channels(id);
ALTER TABLE public.mcp_audit_logs ADD COLUMN IF NOT EXISTS message_id uuid REFERENCES public.messages(id);
ALTER TABLE public.mcp_audit_logs ADD COLUMN IF NOT EXISTS request_id uuid REFERENCES public.mcp_message_requests(id);

COMMIT;
