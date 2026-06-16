-- คืน admin ให้ Mark
-- ถ้า error "Only admin can change roles" ให้รัน fix-protect-profile-role-bypass.sql ก่อน

UPDATE public.profiles p
SET
  role = 'admin',
  display_roles = ARRAY['admin', 'pm']::TEXT[]
FROM auth.users u
WHERE p.id = u.id
  AND lower(u.email) = 'markrock342@gmail.com';
