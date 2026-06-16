-- Pro notifications: prefs, dedupe, server-side chat dispatch hook
-- รันใน Supabase SQL Editor (รันซ้ำได้)

-- ========== คอลัมน์ preferences ==========
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS notify_chat BOOLEAN DEFAULT TRUE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS notify_mentions BOOLEAN DEFAULT TRUE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS notify_tasks BOOLEAN DEFAULT TRUE;

-- ========== notifications: dedupe + push tracking ==========
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS source_type TEXT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS source_id UUID;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS push_sent BOOLEAN DEFAULT FALSE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_source_unique
  ON notifications(user_id, source_type, source_id)
  WHERE source_type IS NOT NULL AND source_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_push_pending
  ON notifications(push_sent, created_at DESC)
  WHERE push_sent = FALSE;

-- ========== app settings (สำหรับ trigger → Vercel dispatch) ==========
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- ตั้งค่าหลังรัน (แก้ URL/secret ให้ตรง Vercel):
-- INSERT INTO app_settings (key, value) VALUES
--   ('notification_dispatch_url', 'https://lcs-team.vercel.app/api'),
--   ('notification_dispatch_secret', 'ใส่ค่าเดียวกับ NOTIFICATION_DISPATCH_SECRET บน Vercel')
-- ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- เปิด pg_net ถ้ายังไม่มี (Supabase Dashboard → Database → Extensions)
-- CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- ========== trigger: เรียก API เมื่อมีข้อความใหม่ (backup ถ้า client ไม่ทันเรียก) ==========
CREATE OR REPLACE FUNCTION trg_messages_dispatch_notifications()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_base_url TEXT;
  v_secret TEXT;
BEGIN
  IF NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT value INTO v_base_url FROM app_settings WHERE key = 'notification_dispatch_url';
  IF v_base_url IS NULL OR v_base_url = '' THEN
    RETURN NEW;
  END IF;

  SELECT value INTO v_secret FROM app_settings WHERE key = 'notification_dispatch_secret';

  BEGIN
    PERFORM net.http_post(
      url := rtrim(v_base_url, '/') || '/notifications/chat',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || COALESCE(v_secret, '')
      ),
      body := jsonb_build_object('messageId', NEW.id::text)
    );
  EXCEPTION
    WHEN undefined_function THEN
      NULL; -- pg_net ยังไม่ enable — client API ยังทำงาน
    WHEN OTHERS THEN
      NULL; -- ห้าม block การส่งข้อความ
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS messages_dispatch_notifications ON messages;
CREATE TRIGGER messages_dispatch_notifications
  AFTER INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION trg_messages_dispatch_notifications();
