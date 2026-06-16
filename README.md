# Limit Code — Team Workspace

ระบบจัดการทีม Freelance Software House สำหรับทีม **Limit Code**

## ทีม

| ชื่อ | บทบาท | หน้าที่ |
|------|--------|---------|
| Mark | PM | Project Manager |
| Knott | Backend | Backend Developer |
| Bank | Design | UX/UI & Frontend |

## ฟีเจอร์

- **Login/Register** — ระบบเข้าสู่ระบบด้วย Supabase Auth
- **ลูกค้า** — เพิ่ม/แก้ไขข้อมูลลูกค้า, ผู้ติดต่อ, ประเภทงาน (แอพ, เว็บ, ระบบ, design ฯลฯ)
- **งาน** — ติดตามงาน สถานะ (ยังไม่เริ่ม, รอดำเนินการ, กำลังทำ, รอตรวจ, เสร็จแล้ว), ระยะเวลา (วัน)
- **ตารางงาน** — ดู timeline รายสัปดาห์ + ตารางรายการ
- **แชททีม** — แชท realtime, ส่งรูป/ไฟล์
- **รองรับมือถือ** — Responsive + bottom navigation

## เริ่มต้นใช้งาน

### 1. ติดตั้ง dependencies

```bash
npm install
```

### 2. ตั้งค่า Supabase

1. สร้างโปรเจกต์ที่ [supabase.com](https://supabase.com)
2. ไปที่ **SQL Editor** แล้วรันไฟล์ `supabase/schema.sql`
3. ไปที่ **Storage** → สร้าง bucket ชื่อ `uploads` (Public bucket)
4. รัน storage policies ใน SQL Editor:

```sql
CREATE POLICY "Authenticated upload" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'uploads');

CREATE POLICY "Public read uploads" ON storage.objects
  FOR SELECT TO public USING (bucket_id = 'uploads');

CREATE POLICY "Authenticated delete" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'uploads');
```

5. คัดลอก `.env.local.example` เป็น `.env.local` แล้วใส่ URL และ Anon Key

```bash
cp .env.local.example .env.local
```

### 3. สร้างบัญชีทีม

สมัครสมาชิกผ่านหน้า Login ด้วยอีเมลของแต่ละคน แล้วอัปเดต profile:

```sql
UPDATE profiles SET display_name = 'Mark', role = 'pm', username = 'mark' WHERE username = 'mark';
UPDATE profiles SET display_name = 'Knott', role = 'backend', username = 'knott' WHERE username = 'knott';
UPDATE profiles SET display_name = 'Bank', role = 'design', username = 'bank' WHERE username = 'bank';
```

### 4. รัน dev server

```bash
npm run dev
```

เปิด [http://localhost:3000](http://localhost:3000)

## Tech Stack

- **Next.js 16** (App Router)
- **Supabase** (Auth, Database, Storage, Realtime)
- **Tailwind CSS 4**
- **TypeScript**

## โครงสร้าง

```
src/
  app/
    (app)/          # หน้าหลัก (ต้อง login)
      dashboard/    # ภาพรวม
      clients/      # ลูกค้า
      tasks/        # งาน
      schedule/     # ตารางงาน
      chat/         # แชททีม
    login/          # เข้าสู่ระบบ
  components/       # UI components
  lib/              # Supabase, types, constants
supabase/
  schema.sql        # Database schema
```
