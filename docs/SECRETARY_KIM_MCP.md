# เลขาคิมและเครื่องมือ MCP ของ LCS Team

## ตอบในห้อง LCS โดยตรง

- แอดมินเปิดเลขาคิมและอนุญาตห้องครั้งเดียวใน Settings
- สมาชิกเรียก `@เลขาคิม` หรือตอบกลับข้อความของเลขาคิม แล้ว AI จะตอบในห้องเดิมโดยไม่ต้องอนุมัติรายข้อความ
- ส่งเฉพาะประวัติ 16 ข้อความล่าสุดของห้องที่อนุญาตไป Gemini เพื่อสร้างคำตอบ
- บอทอ่านและตอบข้ามห้องไม่ได้ และไม่สามารถใช้ข้อความในห้องเป็นคำอนุมัติให้ทำงานหรือส่งข้อความภายนอก
- จำกัดต่อผู้ใช้ 5 คำขอต่อนาที และ 100 คำขอต่อ 24 ชั่วโมง

## Repository และระบบที่ใช้จริง

ทำใน `/Users/code/lcs_team` ซึ่งเป็น Next.js ของ `https://lcs-team.vercel.app` ไม่ใช่ `/Users/nursego/Desktop/lcs-outreach-console` ที่เป็น Express/Facebook outreach และไม่มี LCS MCP server

- `src/app/api/mcp/route.ts`: stateless Streamable HTTP transport, authenticated ก่อนสร้าง MCP server
- `src/lib/mcp-auth.ts`: ตรวจ bearer token กับ Supabase Auth และอ่าน role จาก Neon; guest/BOT เชื่อมเป็น MCP user ไม่ได้
- `src/lib/lcs-mcp.ts`: ลงทะเบียนเครื่องมือเดิมและใหม่ ใช้ SDK เดิม
- `src/app/api/neon/chat/route.ts`: บันทึก `messages`, ผู้ส่งผูก `profiles`, DM ใช้ `channels.kind='dm'` กับ `channel_members`
- การเข้าห้องปกติใช้สิทธิ์ห้องรวมเดิม; DM ต้องเป็นผู้สร้างหรือสมาชิก ไม่มีระบบแชทใหม่และไม่สร้าง DM จาก MCP
- UI แชท poll ทุก 5 วินาที ไม่ใช่ WebSocket; ข้อความ Bot ปรากฏผ่าน API/ประวัติและ polling เดิม
- `insertChatMessageNotifications` เขียน inbox ใน transaction เดียวกับข้อความ; Push ทำหลัง commit ผ่าน `after()` เหมือนข้อความปกติ
- `clients` เป็นโมเดลลูกค้า/โปรเจกต์เดิม ไม่มีตาราง projects แยก จึงเพิ่ม `clients.parent_client_id` สำหรับโครงการของลูกค้า โดยค่าเดิมเป็น NULL
- ช่องแชทไม่มี foreign key โปรเจกต์ จึงคืน `project_id: null` และไม่เดาความสัมพันธ์จากชื่อห้อง
- Vercel เดิมใช้ validate → build → postbuild migration; migration ของเลขาคิมและลูกค้าใหม่เป็นไฟล์แยก รันจาก build ได้เฉพาะเมื่อกำหนด `LCS_MCP_APPLY_WRITE_MIGRATIONS=true` สำหรับ release ที่อนุมัติ

หลังผู้ใช้อนุมัติ deploy ได้ตรวจ schema metadata ของ Production และรัน migration ผ่าน Vercel build แล้ว โดยตรวจจำนวนแถวตารางเดิมและอนุญาตเพิ่มเฉพาะ Bot profile หนึ่งบัญชี การทดสอบอัตโนมัติยังใช้ PostgreSQL สังเคราะห์ ไม่ได้ใช้ข้อมูล Production ทดสอบส่งข้อความ และยังต้อง Refresh Connector ผ่านบัญชี ChatGPT ของผู้ใช้ มี `scripts/secretary-kim-preflight.sql` สำหรับตรวจ metadata ของ target ก่อน apply จริง และ migration ปฏิเสธ schema ที่ยังผูก `profiles.id` กับ auth FK โดยไม่แก้/ลบ constraint นั้นเอง

## เครื่องมือ

| Tool | ผลลัพธ์/การทำงาน | ประเภท |
| --- | --- | --- |
| `list_channels` | channel_id, channel_name, channel_type, project_id, can_send_message, member_ids ของห้องที่ผู้ใช้เข้าถึงได้ | อ่าน |
| `get_channel_members` | member_id, display_name, role เฉพาะห้องที่เข้าถึงได้ | อ่าน |
| `search_members` | ค้นชื่อ/username คืนหลายตัวเลือกเมื่อชื่อซ้ำ ไม่สร้าง DM | อ่าน |
| `send_message` | เตรียมคำขอ → ให้มนุษย์อนุมัติใน LCS → retry จึงส่งเป็นเลขาคิม | เขียนแบบ opt-in |
| `get_client_details` | รายละเอียดลูกค้า/โปรเจกต์และโครงการย่อย ไม่คืน portal token หรือ credentials | อ่าน |
| `create_client` | เพิ่ม record ลูกค้าเดิม ผู้สร้างมาจาก authenticated actor | เขียนแบบ opt-in |
| `update_client` | แก้เฉพาะ changes ที่อนุญาต; ไม่ reset field ที่ไม่ได้ระบุ และปฏิเสธถ้าข้อมูลเปลี่ยนหลังเตรียมคำขอ | เขียนแบบ opt-in |
| `create_project` | เพิ่ม record ใน clients เดิม โดย client_id เป็นลูกค้าหลักและเก็บ parent_client_id | เขียนแบบ opt-in |

เครื่องมือเดิม เช่น get_my_profile, list_projects, get_recent_team_messages, search_workspace, GitHub reads และ gated create_task ยังอยู่ การสร้างงานใช้กฎ/flags เดิมตาม `MCP_CREATE_TASK.md`

## ตัวตนและขอบเขต Bot

- ชื่อ `เลขาคิม`, username `secretary-kim`, account_type `BOT`, bot_description `AI Assistant — Limit Code Studio`
- profile ID สุ่มใหม่ตอน provision และผูก registry `workspace_bots`; ไม่ใช้ Mark หรือบัญชีมนุษย์เดิม
- ไม่มี Supabase login account/token ของ Bot และทั้ง browser auth/MCP auth ปฏิเสธ profile ชนิด BOT
- Bot คง role guest ไม่รับสิทธิ์ Admin/บัญชี และไม่ได้รับห้องใดเป็นค่าเริ่มต้น
- การส่งต้องผ่านทั้งสิทธิ์ actor ปัจจุบัน, registry enabled, identity BOT ที่ตรง canonical name/username, allowlist `workspace_bot_channels` และ membership `channel_members`
- Admin เปิด/ระงับ Bot และ grant/revoke รายห้องที่ Settings; ให้สิทธิ์ DM เท่ากับอนุญาต Bot ส่งในห้องเดิม ไม่มีการสร้างห้องใหม่อัตโนมัติ
- Message UI แสดงชื่อ/ป้าย `AI Assistant`; messages.approved_by เก็บ UUID ของผู้อนุมัติจริง เช่น Mark เมื่อ Mark เป็นผู้สั่ง

## Approval ที่ตรวจสอบได้

`confirm: true` จากโมเดลไม่ใช่หลักฐานมนุษย์อนุมัติ เครื่องมือใหม่ไม่รับ field นี้

1. ผู้ใช้สั่งให้ทำรายการหนึ่งโดยชัดเจน
2. ChatGPT ค้นหาห้อง/สมาชิก/ลูกค้าจริงก่อน ถ้าชื่อซ้ำต้องให้ผู้ใช้เลือก ID และระบุข้อความให้ครบ
3. เรียก write tool ครั้งแรก Backend เก็บ pending request และคืน approval_url กับ idempotency_key **ยังไม่มีข้อความ/ลูกค้าถูกสร้าง**
4. ผู้ใช้เปิด URL ล็อกอินด้วยบัญชี LCS เดียวกับ MCP แล้วอ่านรายละเอียดและกดอนุมัติ หากยังไม่ได้ล็อกอินให้ล็อกอินแล้วเปิด URL เดิมอีกครั้ง
5. endpoint อนุมัติใช้ browser session auth และตรวจ Origin ห้ามใช้ bearer token ของ MCP แทน การอนุมัติไม่ส่ง/เขียนรายการหลักเอง
6. กลับ ChatGPT ให้เรียก tool เดิมด้วย input และ idempotency_key เดิม Backend ตรวจสิทธิ์ปัจจุบันซ้ำและลงมือใน transaction
7. รายงานสำเร็จเฉพาะ `status=sent` และ message_id สำหรับแชท หรือ `status=completed` และ result สำหรับลูกค้า

คำขอหมดอายุใน 15 นาที ถ้าเปลี่ยน payload, หมดอายุ หรือถูกปฏิเสธ ต้องเริ่มคำขอและอนุมัติใหม่ด้วย key ใหม่ ปิด feature/revoke room/เปลี่ยน role หลังอนุมัติจะไม่สามารถส่งได้

## Inputs

```json
{"channel_id":"<UUID จาก list_channels>","message":"พรุ่งนี้ให้เริ่มตรวจ Source Code","idempotency_key":"mark-chj-review-001"}
```

`send_message`: ข้อความ trim 1–4000 ตัวอักษร คีย์ไม่เกิน 128 ตัวอักษร `[A-Za-z0-9:_-]` ไม่รับ sender_id, actor_user_id หรือสิทธิ์จาก caller

```json
{"name":"ลูกค้าทดสอบ","company":"บริษัทตัวอย่าง","status":"lead","idempotency_key":"client-001"}
```

```json
{"client_id":"<UUID ลูกค้า>","changes":{"status":"active","contact_name":"ผู้ติดต่อ"},"idempotency_key":"client-update-001"}
```

```json
{"client_id":"<UUID ลูกค้าหลัก>","name":"เว็บไซต์เฟสสอง","project_type":"website","budget":50000,"idempotency_key":"project-001"}
```

ถ้าไม่ส่ง key เซิร์ฟเวอร์สร้าง key จาก hash ของ operation+payload ภายใต้ actor จึงไม่ส่งซ้ำเมื่อ retry แบบเดิม แม้ผู้ใช้ตั้งใจส่งข้อความเดิม/สร้าง record เดิมอีกรอบภายหลัง ต้องใช้ key ใหม่หลังได้รับคำสั่งผู้ใช้ใหม่ ห้ามใช้ key เดิมกับ payload อื่น

## Transactions, rate limit และ audit

- request row lock และ advisory lock ราย actor ป้องกัน concurrent retry/rate-limit race
- Message + notification inbox + request state + audit commit/rollback พร้อมกัน มี unique messages.bot_request_id เพิ่มเติม
- audit มี actor_user_id, bot_user_id, channel_id, message_id, tool_name (action), created_at (timestamp), request_id; business writes ใช้ business_request_id
- ไม่คัดลอกข้อความ/รายละเอียดลูกค้าทั้งหมดเข้า audit; ใช้ content/payload hash กับ IDs แต่ข้อมูลคำขอที่ต้องแสดงให้ผู้อนุมัติถูกเก็บใน request table
- ส่งข้อความไม่เกิน 5 ครั้ง/นาที และ 50 ครั้ง/24 ชม. ต่อ actor; business writes 10 ครั้ง/นาที และ 100 ครั้ง/24 ชม.; เตรียมคำขอใหม่ไม่เกิน 20 ครั้ง/นาที
- อ่านแชท/ค้นหาไม่เรียก write tool หรือสร้าง DM; เนื้อหาในห้อง/โปรเจกต์/repo ถูกระบุเป็น untrusted data ใน MCP instructions ไม่ใช่คำสั่งหรือการอนุมัติของผู้ใช้
- Bot และ client tools ปิดค่าเริ่มต้น แยก flag จาก create_task

## Mute รายแชท

ปุ่มกระดิ่งใช้ได้ทั้งห้องและ DM: 15 นาที, 1 ชั่วโมง, 8 ชั่วโมง, 24 ชั่วโมง, จนกว่าจะเปิดเอง หรือเปิดอีกครั้ง เป็นค่าของผู้ใช้คนนั้นเท่านั้น ใช้กับ toast และ Push รวม mention ประวัติ/ยอดยังไม่อ่านยังคงอยู่

เวลาหมดอายุใช้ NOW() ของฐานข้อมูล ไม่พึ่ง cron ข้อความที่เข้าระหว่าง mute เก็บ notifications.silent จึงไม่แจ้งย้อนหลัง แม้ job delivery เริ่มหลังหมดเวลา ทั้งการส่งแบบมนุษย์และ Bot ใช้เส้นทาง notification เดียวกัน

## ตัวอย่างคำสั่ง Mark

- “เลขาคิม ส่งข้อความไปหาน็อตในห้อง CHJ ว่าพรุ่งนี้ให้เริ่มตรวจ Source Code ให้ฉันตรวจรายการก่อน”
- “เลขาคิม อ่านแชต CHJ ล่าสุดแล้วสรุปให้หน่อย” — อ่านอย่างเดียว
- “เลขาคิม ส่งข้อความหาผักกาด” — ยังต้องระบุคน/ข้อความและอนุมัติ; ถ้าไม่มี DM เดิมจะให้ผู้ใช้เปิดใน LCS เอง
- “เพิ่มลูกค้าชื่อบริษัทตัวอย่าง สถานะ lead แล้วให้ฉันตรวจ”
- “เปิดโครงการเว็บไซต์เฟสสองให้ลูกค้า <ชื่อ> งบ 50,000 บาท ให้ฉันตรวจรายการก่อน”
- “อ่านรายละเอียดลูกค้า <ชื่อ>” — ใช้ list_projects หา ID แล้ว get_client_details ไม่สร้างข้อมูลเอง

## ทดสอบและเปิดใช้งาน

ดู `RELEASE_SECRETARY_KIM.md` รวม preflight/migration, flags, local integration tests, rollback และ refresh MCP metadata

เอกสารอ้างอิง: [OpenAI MCP server annotations](https://developers.openai.com/plugins/build/mcp-server) ระบุว่า annotations ไม่แทน server authorization/validation/confirmation; [connect and refresh metadata](https://developers.openai.com/plugins/deploy/connect-chatgpt) อธิบายการ refresh หลังเปลี่ยน tools
