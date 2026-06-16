-- แสดงหลาย role บนโปรไฟล์ (เช่น Admin + PM) โดยสิทธิ์จริงยังใช้ column role
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS display_roles TEXT[] DEFAULT NULL;

-- Mark: แสดง Admin + PM
UPDATE public.profiles p
SET display_roles = ARRAY['admin', 'pm']::TEXT[]
FROM auth.users u
WHERE p.id = u.id
  AND lower(u.email) = 'markrock342@gmail.com';
