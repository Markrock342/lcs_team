# LCS MCP: gated `create_task`

`create_task` เพิ่มงานได้ครั้งละหนึ่งรายการจาก ChatGPT และ **ปิดอยู่โดยค่าเริ่มต้น** การ Merge หรือ Deploy โค้ดนี้ไม่ทำให้เครื่องมือเขียนเปิดเอง

## ขอบเขต

- ผู้ใช้ต้องยืนยันงานรายการนั้นอย่างชัดเจน และคำสั่งต้องมี `confirm: true`
- อนุญาตเฉพาะ `title`, `description`, `client_id`, `assigned_to`, `priority` และ `due_date`
- เซิร์ฟเวอร์กำหนด `created_by` จาก Supabase Auth, `status=pending` และ `progress=0`
- Role ที่ใช้อนุญาตมาจาก `profiles.role` ใน Neon เท่านั้น ไม่ใช้ `display_roles` หรือ Auth user metadata
- ก่อน INSERT จะตรวจ Role `admin/pm` ซ้ำภายใน Transaction และตรวจว่า Project/Assignee มีอยู่จริง
- งานและ Audit log ถูกเขียนใน Transaction เดียวกัน หาก Audit ล้มเหลว งานจะไม่ถูกสร้าง
- Assignee ที่เป็น `guest` จะถูกปฏิเสธ
- ข้อผิดพลาดฐานข้อมูลและ Secret ไม่ถูกส่งกลับไปยัง MCP client

## Server-side gates

ต้องตั้งค่าทั้งคู่เป็นข้อความ `true` แบบตรงตัว:

```text
LCS_MCP_ENABLE_TASK_CREATION=true
LCS_MCP_ROLE_GUARD_VERIFIED=true
```

หากขาดค่าใดค่าหนึ่ง, ใช้ตัวพิมพ์อื่น หรือ Role ไม่ใช่ `admin/pm` เครื่องมือจะไม่ถูกลงทะเบียนและไม่ปรากฏใน `tools/list`

## Checklist ก่อนเปิด Production

1. ตรวจสมาชิกจริงใน Neon ว่า `profiles.id` ตรงกับ Supabase Auth user ID และ Role ทุกคนถูกต้อง
2. ยืนยันว่าการสมัครใหม่ผ่าน `src/app/auth/callback/route.ts` สร้าง Role เป็น `guest` และผู้ใช้แก้ Role ตัวเองผ่าน API ไม่ได้
3. ทดสอบด้วยข้อมูลสังเคราะห์: admin/pm สร้างได้, Role อื่นสร้างไม่ได้, Project/Assignee ปลอมถูกปฏิเสธ
4. ตรวจ Audit log และยืนยันว่าไม่มีรายละเอียดงานหรือ Secret ถูกคัดลอกเกินจำเป็น
5. รัน `npm test`, `npx tsc --noEmit`, `npm run lint` และ `npm run build`
6. Review และอนุมัติการเปิดเขียนแยกจากการอนุมัติ Merge จากนั้นจึงตั้ง Flag บน Vercel Production และ Redeploy
7. เปิดหน้า OAuth consent อีกครั้งและปรับข้อความสิทธิ์ให้ตรงกับเครื่องมือเขียนก่อนให้สมาชิกเชื่อมใหม่

Supabase Database เป็น Legacy reference เท่านั้น ข้อมูลแอปและการสร้าง Task ใช้ Neon โดยตรง หากโครงการ Supabase ยังมี `public.profiles` ให้รัน `supabase/harden-profile-role-integrity.sql` เพื่อเลิกเชื่อถือ `raw_user_meta_data.role` ก่อนใช้งานต่อ

## Rollback

ตั้งค่า Flag ตัวใดตัวหนึ่งเป็น `false` แล้ว Redeploy เครื่องมือ `create_task` จะหายจาก MCP catalog โดยไม่กระทบเครื่องมืออ่านและไม่ลบงานเดิม
