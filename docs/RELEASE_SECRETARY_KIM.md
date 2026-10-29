# Release checklist: เลขาคิม, client tools และ mute

ผู้ใช้อนุมัติให้ deploy เมื่อเสร็จแล้วเมื่อ 29 ตุลาคม 2026 ตรวจ target metadata และ apply migration ผ่านบน Vercel production build แล้ว การทดสอบส่งข้อความใช้ PostgreSQL สังเคราะห์เท่านั้น การอนุมัติ deploy ไม่ใช่การอนุมัติส่งข้อความเข้าห้องจริง

## ขออนุมัติก่อนทำ Production

คำขอต้นฉบับกำหนดว่า “หากมีการเปลี่ยนแปลง Database หรือ Production Environment ต้องแจ้งก่อนดำเนินการ” และ “ห้าม Deploy หรือส่งข้อความเข้าห้องใช้งานจริงโดยไม่ได้รับอนุมัติ”

แยกอนุมัติให้ชัดเจน:

1. ตรวจ metadata เป้าหมายด้วย `scripts/secretary-kim-preflight.sql` (read-only ไม่อ่านแชทจริง)
2. เพิ่ม schema mute, Bot, request/audit และ parent_client_id; สร้าง profile BOT ใหม่หนึ่งบัญชี ไม่รับสิทธิ์ห้องอัตโนมัติ ไม่ลบ/เปลี่ยนข้อมูลข้อความและผู้ใช้อื่น
3. เปิด environment flags ที่ต้องการ และ deploy source บน Vercel
4. เลือกห้อง **ทดสอบ** และข้อความสังเคราะห์ที่ได้รับอนุมัติแยกก่อนทดสอบส่งจริง ห้ามแทนที่ด้วยห้องใช้งานจริง

อย่า push branch ไป Git remote หากยังไม่อนุมัติ Preview deployment เพราะ repo นี้มี Git integration ของ Vercel ซึ่งสร้าง Preview เมื่อ push

## Target preflight

- ตรวจ information_schema และ foreign keys ของ profiles, channels, channel_members, messages, notifications, clients, mcp_audit_logs จาก query ที่เตรียมไว้
- เทียบ columns กับโค้ด route ปัจจุบันและ migration ที่จะ apply
- ถ้า profiles.id ยังอ้าง auth/legacy_auth_users ต้องหยุดก่อน provision Bot; SQL ปฏิเสธโดยไม่ลบ FK ไม่มีการสร้างบัญชี auth จากอีเมลหรือ credentials ที่เดาเอง
- ถ้ามี username secretary-kim อยู่โดยไม่มี registry เดิม ให้หยุดตรวจตัวตน ห้าม adopt บัญชีมนุษย์
- Snapshot/backup ตามขั้นตอนฐานข้อมูลของทีมก่อน apply

## Migration หลังอนุมัติ

ใช้ Neon SQL Editor หรือ runner ที่มี DATABASE_URL ภายใน server environment อยู่แล้ว ไม่ export production secrets ลงไฟล์/แชท

รันตามลำดับ:

1. `scripts/neon-team-engineering-workspace.sql` (audit เดิม)
2. `scripts/neon-custom-team-tags.sql` (หากยังไม่เคยรัน)
3. `scripts/neon-chat-mutes.sql`
4. `scripts/neon-secretary-kim.sql`
5. `scripts/neon-mcp-client-writes.sql`

แต่ละ Bot/business file เป็น standalone BEGIN/COMMIT ตรวจว่าผ่านก่อนขั้นต่อไป Production postbuild ทำ tags/mute แบบ additive ส่วน Bot/business migrations รันเฉพาะ release ที่ส่ง build flag `LCS_MCP_APPLY_WRITE_MIGRATIONS=true` หลังผู้ใช้อนุมัติ โดย log schema metadata ก่อนและตรวจ row counts ใน repeatable-read snapshot อนุญาตเพิ่ม profiles ได้หนึ่งแถวสำหรับ Bot ใหม่เท่านั้น ตารางเดิมอื่นต้องมีจำนวนแถวเท่าเดิม

ตรวจหลังรัน:

- profiles มี secretary-kim ชนิด BOT และชื่อเลขาคิมเพียงหนึ่งบัญชี role guest, notify_* และ push_enabled=false
- workspace_bots.enabled=false และ workspace_bot_channels ยังว่าง จนกว่าแอดมินจะเลือก
- ไม่เปลี่ยนจำนวน/ผู้ส่งของ messages เดิม, จำนวน clients เดิม และ roles ของสมาชิกเดิม
- มี unique actor+idempotency_key และ messages.bot_request_id

## Environment และ Vercel

เพิ่ม/เปิดเฉพาะหลังอนุมัติ:

```text
LCS_MCP_ENABLE_BOT_MESSAGING=true
LCS_MCP_ENABLE_CLIENT_WRITES=true
```

ใช้ false ปิดได้โดยอิสระ ไม่มี API key ของโมเดลเพิ่มสำหรับงานนี้ ใช้ OAuth/Supabase Auth และ Neon pool เดิม คีย์บริการเดิมไม่ถูกเผยใน tool result

`create_task` ใช้ flags เดิม ห้ามเปลี่ยนระหว่าง release นี้โดยไม่จำเป็น

Deploy ตาม Vercel project ที่ผูกกับ repo รอ validate/build/postbuild ผ่าน ตรวจ /login=200, unauthenticated /api/mcp=401 พร้อม challenge และ protected API=401 ก่อน promote production domain

## Smoke test หลัง deploy ที่ได้รับอนุมัติ

1. Mark ล็อกอิน Settings → เลขาคิม เปิด bot และอนุญาตเฉพาะห้องทดสอบที่ตกลงไว้
2. Refresh/reconnect MCP ใน ChatGPT แล้วตรวจ tools/list หลัง auth ว่ามีเครื่องมือที่เปิดไว้และ role ที่ถูกต้อง
3. ใช้ list_channels หา ID ห้ามเดา ID จากชื่อ ถ้าคนชื่อซ้ำให้เลือกผู้รับ
4. send_message ครั้งแรกต้อง approval_required และยังไม่มีข้อความ
5. Mark เปิด approval_url อ่านข้อความ กดอนุมัติ แล้ว ChatGPT retry input/key เดิม
6. ตรวจ result=sent + message_id; หน้าแชทมีชื่อเลขาคิมและ AI Assistant, approved_by=Mark, audit request_id ครบ และ inbox/Push ตาม mute ของผู้รับ
7. retry key เดิมต้องคืน message_id เดิม ไม่มีข้อความซ้ำ
8. revoke ห้องแล้วคำขอใหม่ต้องถูกปฏิเสธ และไม่มี DM ใหม่
9. การอ่าน CHJ/ค้น workspace ไม่ส่งข้อความ, create_task และ GitHub reads ยังอยู่ตาม role/flags เดิม
10. ทดสอบ create_client/update_client/create_project ด้วยข้อมูลสังเคราะห์ที่อนุมัติ และตรวจ get_client_details/parent_client_id
11. ทดสอบ mute 15 นาที/forever/unmute กับสองบัญชี ยอดยังไม่อ่านยังอยู่ ไม่มี toast/Push ย้อนหลังเมื่อหมดเวลา

การยืนยัน metadata ผ่าน local MCP SDK ที่ทดสอบแล้วไม่ใช่การยืนยันว่า ChatGPT production connection รีเฟรชแล้ว ต้องตรวจจริงหลัง deploy/Refresh เปิดบทสนทนาใหม่ทดสอบตาม [OpenAI documentation](https://developers.openai.com/plugins/deploy/connect-chatgpt)

## Automated tests

```bash
npm run validate
```

Integration ต้องใช้ PostgreSQL ในเครื่องและบัญชีที่ CREATE DATABASE ได้ ตัว runner สร้าง DB ชื่อ lcs_kim_test_* ใหม่ ใช้ fixture สังเคราะห์ แล้ว drop เฉพาะ DB นั้นเมื่อเสร็จ และปฏิเสธ URL ที่ไม่ใช่ localhost

```bash
LCS_TEST_DATABASE_URL=postgresql://<local-user>@127.0.0.1:<local-port>/postgres npm run test:integration
```

Default unit suite ข้าม integration เมื่อไม่ได้ระบุ URL; CI ที่ต้องการ integration ให้จัด local Postgres และรันคำสั่งนี้แยก Production build ไม่เชื่อมฐานทดสอบหรือใช้ข้อมูลจริงเพื่อทดสอบ

## Rollback

- ระงับเลขาคิมจาก Settings หรือเปลี่ยน LCS_MCP_ENABLE_BOT_MESSAGING=false แล้ว redeploy
- เปลี่ยน LCS_MCP_ENABLE_CLIENT_WRITES=false แล้ว redeploy เพื่อซ่อน write tools ลูกค้า
- Refresh metadata ใน ChatGPT หลังปิด flags
- เก็บ Bot profile, messages, request/audit และ client records ไว้เพื่อหลักฐาน ห้าม drop schema หรือลบข้อความ/ผู้ใช้จริงระหว่าง rollback
- flags ใหม่ไม่เปลี่ยน create_task gates หรือเครื่องมืออ่านเดิม
