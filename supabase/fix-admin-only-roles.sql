-- ให้เฉพาะ admin เปลี่ยน role / badge (display_roles) ได้
-- รันใน Supabase SQL Editor

CREATE OR REPLACE FUNCTION public.protect_profile_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_admin BOOLEAN;
BEGIN
  is_admin := EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  );

  IF OLD.role IS DISTINCT FROM NEW.role THEN
    IF OLD.id = auth.uid() AND OLD.role = 'admin' AND NEW.role <> 'admin' THEN
      RAISE EXCEPTION 'Cannot demote yourself from admin';
    END IF;

    IF OLD.id = auth.uid() THEN
      RAISE EXCEPTION 'Cannot change your own role';
    END IF;

    IF auth.uid() IS NULL OR NOT is_admin THEN
      RAISE EXCEPTION 'Only admin can change roles';
    END IF;
  END IF;

  IF OLD.display_roles IS DISTINCT FROM NEW.display_roles THEN
    IF auth.uid() IS NULL OR NOT is_admin THEN
      RAISE EXCEPTION 'Only admin can change badges';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_profile_role_before_update ON profiles;
CREATE TRIGGER protect_profile_role_before_update
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_role();

DROP POLICY IF EXISTS "Admin can manage team roles" ON profiles;
CREATE POLICY "Admin can manage team roles"
  ON profiles FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );
