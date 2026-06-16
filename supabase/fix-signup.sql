-- Fix: สมัครสมาชิกไม่ได้ (Database error saving new user)
-- รันใน Supabase SQL Editor

-- 1. แก้ trigger function ให้ถูกต้องตามมาตรฐาน Supabase
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  base_username TEXT;
  final_username TEXT;
BEGIN
  base_username := COALESCE(
    NEW.raw_user_meta_data->>'username',
    split_part(NEW.email, '@', 1)
  );

  -- ป้องกัน username ซ้ำ
  final_username := base_username;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE username = final_username) THEN
    final_username := base_username || '_' || substr(NEW.id::text, 1, 8);
  END IF;

  INSERT INTO public.profiles (id, username, display_name, role)
  VALUES (
    NEW.id,
    final_username,
    COALESCE(NEW.raw_user_meta_data->>'display_name', base_username),
    COALESCE(NEW.raw_user_meta_data->>'role', 'pm')
  );

  RETURN NEW;
EXCEPTION
  WHEN others THEN
    RAISE LOG 'handle_new_user error: %', SQLERRM;
    RAISE;
END;
$$;

-- 2. สร้าง trigger ใหม่ (ถ้ายังไม่มี)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- 3. เพิ่ม INSERT policy ที่ขาดไป
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- 4. ให้ trigger bypass RLS ได้
GRANT USAGE ON SCHEMA public TO postgres, supabase_auth_admin;
GRANT ALL ON public.profiles TO postgres, supabase_auth_admin;
