-- Guest role: คนสมัครใหม่จะได้สิทธิ์ guest (ดูอย่างเดียว + แชท)
-- แก้ไข/ลบ/สร้างไม่ได้ และไม่เห็นการเงินทีม (ซ่อนใน UI)
-- รันใน Supabase SQL Editor (รันซ้ำได้)

-- 1. เพิ่ม 'guest' เข้า constraint ของ role
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'pm', 'backend', 'design', 'guest'));

-- 2. เปลี่ยน default ตอนสมัครใหม่: ทุกคน = guest (ยกเว้น admin email)
--    สมาชิกเดิมไม่กระทบ (trigger ทำงานเฉพาะตอนสมัครใหม่)
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

  -- คนสมัครใหม่ = guest เสมอ (มีแค่ admin email ที่เป็น admin)
  -- admin จะไปเลื่อน role ให้เป็น pm / backend / design ทีหลังได้
  assigned_role := CASE
    WHEN lower(NEW.email) = 'markrock342@gmail.com' THEN 'admin'
    ELSE 'guest'
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

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
