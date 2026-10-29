-- Display-only labels; permission checks continue to use role/display_roles.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS custom_tags text[] NOT NULL DEFAULT '{}'::text[];
