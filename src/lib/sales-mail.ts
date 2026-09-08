import nodemailer from "nodemailer";

export const SALES_MAIL_FROM_NAME = "Limit Code Studio";

export function getSalesGmail() {
  const user =
    process.env.SALES_GMAIL_USER?.trim() ||
    process.env.SALES_SMTP_USER?.trim() ||
    "";
  const pass =
    process.env.SALES_GMAIL_APP_PASSWORD?.trim() ||
    process.env.SALES_SMTP_PASS?.trim() ||
    "";
  return user && pass ? { user, pass } : null;
}

export function parseEmailDraft(text: string, fallbackSubject: string) {
  const lines = text.replace(/\r\n/g, "\n").trim().split("\n");
  const index = lines.findIndex((line) => /^(หัวข้อ|subject)\s*[:：]/i.test(line.trim()));
  if (index >= 0) {
    const subject = lines[index].replace(/^(หัวข้อ|subject)\s*[:：]\s*/i, "").trim();
    const body = [...lines.slice(0, index), ...lines.slice(index + 1)].join("\n").trim();
    return { subject: subject || fallbackSubject, body: body || text.trim() };
  }
  return { subject: fallbackSubject, body: text.trim() };
}

export async function sendSalesEmail(input: {
  to: string;
  subject: string;
  body: string;
}) {
  const auth = getSalesGmail();
  if (!auth) {
    throw new Error(
      "ยังไม่ได้ตั้งเมลทีม — ใส่ SALES_GMAIL_USER และ SALES_GMAIL_APP_PASSWORD ใน Vercel (ใช้รหัสผ่านแอปของ Gmail ไม่ใช่รหัสเข้าจีเมลปกติ)"
    );
  }

  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth,
  });

  await transporter.sendMail({
    from: `"${SALES_MAIL_FROM_NAME}" <${auth.user}>`,
    to: input.to,
    replyTo: auth.user,
    subject: input.subject,
    text: input.body,
  });

  return { from: auth.user };
}
