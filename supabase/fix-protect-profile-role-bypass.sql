-- แก้ trigger ที่บล็อก SQL Editor (auth.uid() = null)
-- รันก่อน fix-restore-admin.sql / fix-team-roles.sql

CREATE OR REPLACE FUNCTION public.protect_profile_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_admin BOOLEAN;
BEGIN
  -- SQL Editor / migration ไม่มี JWT — ให้ผ่าน
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

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

    IF NOT is_admin THEN
      RAISE EXCEPTION 'Only admin can change roles';
    END IF;
  END IF;

  IF OLD.display_roles IS DISTINCT FROM NEW.display_roles THEN
    IF NOT is_admin THEN
      RAISE EXCEPTION 'Only admin can change badges';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
