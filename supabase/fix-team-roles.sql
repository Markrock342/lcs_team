-- แก้ role ทีม LCS (ทุกคนเป็น PM เพราะ default ตอนสมัคร)
-- รันใน Supabase SQL Editor

-- 1. ตั้ง role ตาม username / อีเมล
UPDATE public.profiles p
SET
  role = 'admin',
  display_name = COALESCE(NULLIF(p.display_name, ''), 'Mark'),
  username = CASE WHEN p.username ~ '^(mark|markrock)' THEN 'mark' ELSE p.username END,
  display_roles = ARRAY['admin', 'pm']::TEXT[]
FROM auth.users u
WHERE p.id = u.id
  AND (
    lower(u.email) = 'markrock342@gmail.com'
    OR lower(p.username) IN ('mark', 'markrock342', 'markrock')
  );

UPDATE public.profiles
SET role = 'backend', display_name = COALESCE(NULLIF(display_name, ''), 'Knott')
WHERE lower(username) IN ('knott')
   OR lower(username) LIKE 'knott%';

UPDATE public.profiles
SET role = 'design', display_name = COALESCE(NULLIF(display_name, ''), 'Bank')
WHERE lower(username) IN ('bank')
   OR lower(username) LIKE 'bank%';

-- 2. สมัครใหม่: จับ username ทีมอัตโนมัติ (ไม่ default เป็น PM ทุกคน)
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
    NEW.raw_user_meta_data->>'username',
    split_part(NEW.email, '@', 1)
  ));

  final_username := base_username;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE username = final_username) THEN
    final_username := base_username || '_' || substr(NEW.id::text, 1, 8);
  END IF;

  assigned_role := CASE
    WHEN lower(NEW.email) = 'markrock342@gmail.com' THEN 'admin'
    WHEN base_username IN ('mark', 'markrock342', 'markrock') THEN 'admin'
    WHEN base_username IN ('knott') OR base_username LIKE 'knott%' THEN 'backend'
    WHEN base_username IN ('bank') OR base_username LIKE 'bank%' THEN 'design'
    ELSE COALESCE(NEW.raw_user_meta_data->>'role', 'pm')
  END;

  INSERT INTO public.profiles (id, username, display_name, role, display_roles)
  VALUES (
    NEW.id,
    final_username,
    COALESCE(NEW.raw_user_meta_data->>'display_name', base_username),
    assigned_role,
    CASE
      WHEN assigned_role = 'admin' THEN ARRAY['admin', 'pm']::TEXT[]
      ELSE NULL
    END
  );

  RETURN NEW;
EXCEPTION
  WHEN others THEN
    RAISE LOG 'handle_new_user error: %', SQLERRM;
    RAISE;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
