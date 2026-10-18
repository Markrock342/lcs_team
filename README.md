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
- **Code Workspace** — อ่านไฟล์, commit และ pull request จาก GitHub แบบ read-only
- **LCS Assistant** — ถามงานหรือโค้ดจากมือถือ พร้อมประวัติส่วนตัวใน Neon
- **ChatGPT Connector** — Remote MCP แบบ read-only เชื่อมกับ ChatGPT แชทปกติผ่าน Supabase OAuth
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

### 5. ตั้งค่า Code Workspace และ LCS Assistant

เพิ่ม environment แบบ server-only ใน `.env.local` และ Vercel Production:

```bash
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-5.4-mini
GITHUB_READ_TOKEN=github_pat_...
GITHUB_DEFAULT_REPOSITORIES=Markrock342/lcs_team
```

- สร้าง GitHub fine-grained token โดยเลือกเฉพาะ repository ที่ทีมใช้ และให้สิทธิ์ **Contents: Read-only** เท่านั้น
- Repository ใน `clients.repo_url` จะถูกเพิ่มเข้า allowlist อัตโนมัติ; repository อื่นระบุใน `GITHUB_DEFAULT_REPOSITORIES` แบบคั่นด้วย comma
- ไฟล์ secret, key, certificate, `.env` และ binary จะถูกบล็อกทั้งในหน้า Code และ MCP
- `OPENAI_API_KEY` และ GitHub token ห้ามใช้ prefix `NEXT_PUBLIC_`
- LCS Assistant ส่งคำขอด้วย `store: false`; ประวัติสนทนาแยกตามผู้ใช้และเก็บใน Neon

สร้างตารางสำหรับ Assistant และ audit log ของ MCP:

```bash
psql "$DATABASE_URL" -f scripts/neon-team-engineering-workspace.sql
```

คำสั่งเป็น `CREATE TABLE IF NOT EXISTS` จึงไม่แก้หรือลบข้อมูลเดิม

เมื่อ Vercel build ใน Production สคริปต์ `postbuild` จะรัน migration นี้อัตโนมัติภายใน Vercel และตรวจจำนวนแถวของทุกตารางก่อน–หลัง หากข้อมูลเดิมเปลี่ยนหรือเชื่อม Neon ไม่ได้ deployment จะหยุดก่อนขึ้น Production ส่วน local และ Preview จะข้ามขั้นตอนนี้

### 6. เชื่อมกับ ChatGPT แชทปกติ

แอปเปิด Remote MCP endpoint ที่:

```text
https://YOUR-DOMAIN/api/mcp
```

Connector เป็น **read-only** และตรวจผู้ใช้ด้วย Supabase Auth ก่อนอ่านข้อมูลทุกครั้ง ตั้งค่า Supabase หนึ่งครั้งดังนี้:

1. ไปที่ **Authentication → OAuth Server** แล้วเปิด OAuth 2.1 Server
2. เปิด **Dynamic Client Registration** สำหรับ ChatGPT
3. ตั้ง Authorization/Consent path เป็น `/oauth/consent`
4. ใช้ asymmetric JWT signing key ใน **JWT Keys**
5. เพิ่ม production domain และ local domain ใน **Authentication → URL Configuration**
6. Deploy แล้วเปิด `https://YOUR-DOMAIN/.well-known/oauth-protected-resource` เพื่อตรวจ metadata
7. ใน ChatGPT ไปที่ **Settings → Connectors → Add custom connector** แล้ววาง MCP endpoint ด้านบน
8. Login ด้วยบัญชี LCS และกดยอมรับสิทธิ์อ่านข้อมูล

เครื่องมือที่ ChatGPT เรียกได้: โปรไฟล์ของฉัน, โปรเจกต์, งานของฉัน, คิววันนี้, แชทที่ผู้ใช้มีสิทธิ์, ค้นหาพื้นที่ทำงาน, รายการ repository, activity, tree และ source file ที่ปลอดภัย ไม่มีเครื่องมือเขียน แก้ ลบ merge หรือ deploy

### 7. รัน dev server

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
      code/         # อ่าน GitHub repository
      assistant/    # LCS Assistant
    login/          # เข้าสู่ระบบ
  components/       # UI components
    api/neon/       # Route Handlers สำหรับอ่าน/เขียน Neon
    api/mcp/        # Remote MCP สำหรับ ChatGPT
  lib/
    neon/           # Pool, auth context และ client helper
    supabase/       # Auth session และ Storage client
    types.ts        # Shared application types
supabase/
  schema.sql        # Legacy schema reference; ไม่ใช่ production database
```
