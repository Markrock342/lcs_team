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
- **แชททีม** — แชททีม, thread, reaction, mention และส่งรูป/ไฟล์
- **รองรับมือถือ** — Responsive + bottom navigation

## เริ่มต้นใช้งาน

### 1. ติดตั้ง dependencies

```bash
npm install
```

### 2. ตั้งค่า Supabase Auth และ Storage

1. สร้างโปรเจกต์ที่ [supabase.com](https://supabase.com)
2. เปิด Email Auth ใน **Authentication**
3. ไปที่ **Storage** → สร้าง bucket ชื่อ `uploads` (Public bucket)
4. รัน storage policies ใน SQL Editor ของ Supabase:

```sql
CREATE POLICY "Authenticated upload" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'uploads');

CREATE POLICY "Public read uploads" ON storage.objects
  FOR SELECT TO public USING (bucket_id = 'uploads');

CREATE POLICY "Authenticated delete" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'uploads');
```

5. คัดลอก `.env.local.example` เป็น `.env.local` แล้วใส่ Supabase URL และ Anon Key

```bash
cp .env.local.example .env.local
```

6. **ตั้งค่า Auth URL ใน Supabase** (สำคัญ — ถ้าไม่ตั้ง ลิงก์ยืนยันอีเมลจะไป localhost)

ไปที่ **Authentication → URL Configuration**:

| ช่อง | ค่า |
|------|-----|
| **Site URL** | `https://lcs-team.vercel.app` |
| **Redirect URLs** | `https://lcs-team.vercel.app/**` |
| | `http://localhost:3000/**` |

บน **Vercel** ใส่ env เพิ่ม: `NEXT_PUBLIC_SITE_URL=https://lcs-team.vercel.app` แล้ว Redeploy

> Supabase ใช้เฉพาะ Auth และ Storage เท่านั้น ห้ามสร้างหรือเขียนข้อมูลแอปใหม่ลง Supabase Database

### 3. ตั้งค่า Neon PostgreSQL

ข้อมูลแอปทั้งหมด เช่น Profiles, Clients, Tasks, Chat, Sales, Accounting และ Notifications อยู่ใน Neon

1. Restore schema และข้อมูลจาก backup ที่ตรวจสอบแล้วเข้า Neon
2. ตั้งค่า `DATABASE_URL` แบบ server-only ใน `.env.local` และ Vercel Production
3. ใช้ connection string ที่เปิด TLS เช่น `sslmode=verify-full`
4. ตรวจการเชื่อมต่อหลัง login ที่ `/api/neon/health`

ห้ามเติม prefix `NEXT_PUBLIC_` ให้ `DATABASE_URL` และห้ามส่งค่า connection string ไปยัง browser

### 4. สร้างบัญชีทีม

สมัครสมาชิกผ่านหน้า Login ด้วยอีเมลของแต่ละคน จากนั้นตรวจให้ `profiles.id` ใน Neon ตรงกับ Supabase Auth user ID

```sql
UPDATE profiles SET display_name = 'Mark', role = 'pm', username = 'mark' WHERE username = 'mark';
UPDATE profiles SET display_name = 'Knott', role = 'backend', username = 'knott' WHERE username = 'knott';
UPDATE profiles SET display_name = 'Bank', role = 'design', username = 'bank' WHERE username = 'bank';
```

### 5. รัน dev server

```bash
npm run dev
```

เปิด [http://localhost:3000](http://localhost:3000)

## Tech Stack

- **Next.js 16** (App Router)
- **Neon PostgreSQL** (ข้อมูลแอปทั้งหมด)
- **Supabase** (Auth และ Storage เท่านั้น)
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
    api/neon/       # Route Handlers สำหรับอ่าน/เขียน Neon
  lib/
    neon/           # Pool, auth context และ client helper
    supabase/       # Auth session และ Storage client
    types.ts        # Shared application types
supabase/
  schema.sql        # Legacy schema reference; ไม่ใช่ production database
```
