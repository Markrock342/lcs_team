-- Admin role + มอบหมายสิทธิ์ทีม
-- รันใน Supabase SQL Editor

-- 1. เพิ่ม role admin
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'pm', 'backend', 'design'));

-- 2. สมัครใหม่: markrock342@gmail.com เป็น admin อัตโนมัติ
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
EXCEPTION
  WHEN others THEN
    RAISE LOG 'handle_new_user error: %', SQLERRM;
    RAISE;
END;
$$;

-- 3. ตั้ง markrock342@gmail.com ที่มีอยู่แล้วเป็น admin
UPDATE public.profiles p
SET
  role = 'admin',
  display_name = 'Mark',
  username = CASE
    WHEN p.username IN ('markrock342', 'markrock') THEN 'mark'
    ELSE p.username
  END
FROM auth.users u
WHERE p.id = u.id
  AND lower(u.email) = 'markrock342@gmail.com';

-- 4. กันเปลี่ยน role เอง (เฉพาะ admin เปลี่ยนได้)
CREATE OR REPLACE FUNCTION public.protect_profile_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.role IS DISTINCT FROM NEW.role THEN
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

-- 5. Admin แก้ profile คนอื่นได้ (มอบ role)
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
