BEGIN;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS parent_client_id uuid REFERENCES public.clients(id);
CREATE INDEX IF NOT EXISTS idx_clients_parent ON public.clients(parent_client_id) WHERE parent_client_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS public.mcp_business_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid NOT NULL REFERENCES public.profiles(id),
  tool_name text NOT NULL CHECK (tool_name IN ('create_client','update_client','create_project')),
  idempotency_key text NOT NULL,
  payload jsonb NOT NULL,
  payload_hash text NOT NULL,
  expected_updated_at text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','denied','completed')),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  expires_at timestamptz NOT NULL DEFAULT (NOW()+INTERVAL '15 minutes'),
  approved_at timestamptz,
  completed_at timestamptz,
  result jsonb,
  UNIQUE(actor_user_id,idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_mcp_business_actor_created ON public.mcp_business_requests(actor_user_id,created_at DESC);
ALTER TABLE public.mcp_audit_logs ADD COLUMN IF NOT EXISTS business_request_id uuid REFERENCES public.mcp_business_requests(id);
COMMIT;
