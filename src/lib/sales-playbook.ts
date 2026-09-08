import type { ProspectStatus, SalesProspect } from "@/lib/types";

export type AssistMode = "email" | "call" | "summary" | "next_action";

export const PLAYBOOK = {
  intro:
    "สวัสดีครับ ติดต่อจาก Limit Code Studio ทีมทำระบบจองคอร์ทและเว็บแอปให้สนามแบดมินตัน",
  qualify: [
    "ตอนนี้รับจองคอร์ทยังไง โทร / LINE / กระดาษ?",
    "มีกี่คอร์ท ช่วงไหนคนแน่นที่สุด?",
    "อยากให้ลูกค้าจองและโอนเงินผ่านระบบได้ไหม?",
  ],
  offer: "เราช่วยทำระบบจองคอร์ท เก็บประวัติลูกค้า และออกใบเสร็จให้อยู่ในที่เดียว",
};

export function prospectContext(prospect: Pick<
  SalesProspect,
  "name" | "company" | "contact_name" | "contact_phone" | "contact_email" | "province" | "address" | "notes" | "status"
>) {
  return [
    `สนาม: ${prospect.name}`,
    prospect.company ? `บริษัท: ${prospect.company}` : "",
    prospect.contact_name ? `ผู้ติดต่อ: ${prospect.contact_name}` : "",
    prospect.contact_phone ? `เบอร์: ${prospect.contact_phone}` : "",
    prospect.contact_email ? `อีเมล: ${prospect.contact_email}` : "",
    prospect.province ? `จังหวัด: ${prospect.province}` : "",
    prospect.address ? `ที่อยู่: ${prospect.address}` : "",
    prospect.notes ? `บันทึก: ${prospect.notes}` : "",
    `สถานะ: ${prospect.status}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function assistPrompt(mode: AssistMode, context: string, extra = "") {
  const tasks: Record<AssistMode, string> = {
    email:
      "ร่างอีเมลภาษาไทยสั้น อบอุ่น เป็นกันเอง ไม่ขายของแข็ง ชวนคุยเรื่องระบบจองคอร์ทแบด ใส่หัวข้อและเนื้อหา พร้อมช่องให้ใส่ชื่อผู้ส่ง",
    call:
      "เขียนสคริปต์โทร 30-45 วินาที ภาษาไทยธรรมชาติ มีประโยคเปิด คำถามคัดกรอง 3 ข้อ และประโยคปิดนัด",
    summary:
      "สรุปบทสนทนาเป็น bullet สั้น: สิ่งที่คุย ความสนใจ ข้อค้าง และงานถัดไป",
    next_action:
      "แนะนำ next action เดียวที่ชัดเจน วันที่ติดตามที่สมเหตุสมผล และเหตุผลสั้นๆ เป็นภาษาไทย",
  };
  return `${tasks[mode]}

บริบทลูกค้าเป้าหมาย:
${context}

ข้อมูลเพิ่ม:
${extra || "-"}

ตอบเป็นภาษาไทยเท่านั้น ห้ามสัญญาว่าส่งข้อความแทนมนุษย์`;
}

export function nextStatusFromOutcome(
  current: ProspectStatus,
  outcome: string | null
): ProspectStatus {
  if (outcome === "interested") return "interested";
  if (outcome === "not_interested") return "not_interested";
  if (current === "converted") return current;
  if (outcome === "reached" || outcome === "emailed" || outcome === "callback" || outcome === "voicemail") {
    return current === "new" || current === "assigned" ? "contacted" : current;
  }
  if (outcome === "no_answer") {
    return current === "new" ? "assigned" : current;
  }
  return current;
}
