-- Legacy Supabase profile hardening (idempotent).
-- Production application data lives in Neon; run this only if the legacy
-- public.profiles table still exists in the Supabase project.

ALTER TABLE public.profiles ALTER COLUMN role SET DEFAULT 'guest';

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
  base_username := lower(COALESCE(
    NULLIF(NEW.raw_user_meta_data->>'username', ''),
    split_part(NEW.email, '@', 1),
    'member'
  ));
  base_username := regexp_replace(base_username, '[^a-z0-9_]+', '-', 'g');
  final_username := base_username;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE username = final_username) THEN
    final_username := base_username || '_' || substr(NEW.id::text, 1, 8);
  END IF;

  -- Never trust raw_user_meta_data.role. Only the verified owner address may
  -- bootstrap as admin; every other account starts as guest.
  assigned_role := CASE
    WHEN lower(NEW.email) = 'markrock342@gmail.com' THEN 'admin'
    ELSE 'guest'
  END;

  INSERT INTO public.profiles (id, username, display_name, role)
  VALUES (
    NEW.id,
    final_username,
    left(COALESCE(NULLIF(NEW.raw_user_meta_data->>'display_name', ''), base_username), 200),
    assigned_role
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.protect_profile_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_is_admin BOOLEAN;
  badges_changed BOOLEAN;
BEGIN
  -- SQL Editor/migrations have no end-user JWT and remain operator-controlled.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  actor_is_admin := EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  );
  badges_changed := (to_jsonb(OLD)->'display_roles')
    IS DISTINCT FROM (to_jsonb(NEW)->'display_roles');

  IF OLD.role IS DISTINCT FROM NEW.role OR badges_changed THEN
    IF OLD.id = auth.uid() THEN
      RAISE EXCEPTION 'Cannot change your own role or role badges';
    END IF;
    IF NOT actor_is_admin THEN
      RAISE EXCEPTION 'Only admin can change roles or role badges';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_profile_role_before_update ON public.profiles;
CREATE TRIGGER protect_profile_role_before_update
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_role();

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id AND role = 'guest');
