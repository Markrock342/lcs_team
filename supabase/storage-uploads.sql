-- Storage bucket สำหรับอัปโหลดไฟล์ (clients, tasks, chat, client-files)
-- รันใน Supabase SQL Editor หรือผ่าน MCP (ปิด read_only ก่อน)

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('uploads', 'uploads', true, 52428800)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit;

DROP POLICY IF EXISTS "Authenticated upload uploads" ON storage.objects;
CREATE POLICY "Authenticated upload uploads"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'uploads');

DROP POLICY IF EXISTS "Public read uploads" ON storage.objects;
CREATE POLICY "Public read uploads"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'uploads');

DROP POLICY IF EXISTS "Authenticated update uploads" ON storage.objects;
CREATE POLICY "Authenticated update uploads"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'uploads')
  WITH CHECK (bucket_id = 'uploads');

DROP POLICY IF EXISTS "Authenticated delete uploads" ON storage.objects;
CREATE POLICY "Authenticated delete uploads"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'uploads');
