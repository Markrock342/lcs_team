-- คืน admin ให้ Mark (รันใน Supabase SQL Editor ถ้าติด demote ตัวเอง)
UPDATE public.profiles p
SET role = 'admin'
FROM auth.users u
WHERE p.id = u.id
  AND lower(u.email) = 'markrock342@gmail.com';
