-- กัน admin demote ตัวเอง + กัน non-admin เปลี่ยน role ใคร
-- รันหลัง add-admin-roles.sql

CREATE OR REPLACE FUNCTION public.protect_profile_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.role IS DISTINCT FROM NEW.role THEN
    -- ห้าม admin ลดสิทธิตัวเอง (จะกลับ admin ไม่ได้ถ้ามี admin คนเดียว)
    IF OLD.id = auth.uid() AND OLD.role = 'admin' AND NEW.role <> 'admin' THEN
      RAISE EXCEPTION 'Cannot demote yourself from admin';
    END IF;

    -- ห้ามเปลี่ยน role ตัวเอง (ให้ admin คนอื่นจัดการ)
    IF OLD.id = auth.uid() THEN
      RAISE EXCEPTION 'Cannot change your own role';
    END IF;

    IF auth.uid() IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
    ) THEN
      RAISE EXCEPTION 'Only admin can change roles';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_profile_role_before_update ON profiles;
CREATE TRIGGER protect_profile_role_before_update
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_role();
