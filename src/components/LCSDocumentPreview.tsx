"use client";

import {
  DOCUMENT_TYPE_TITLES,
  LCS_COMPANY,
  formatMoney,
  lineItemAmount,
  sumLineItems,
  type AgreementMeta,
  type DocumentFormData,
  type ProposalMeta,
  type QuotationMeta,
} from "@/lib/invoice-documents";
import { INVOICE_STATUS_LABELS, type InvoiceStatus } from "@/lib/extras-types";
import type { Client } from "@/lib/types";
import { format } from "date-fns";
import { th } from "date-fns/locale";

type Props = {
  data: DocumentFormData & { total_amount?: number; amount_in_words?: string };
  client?: Client | null;
  forPrint?: boolean;
};

function formatDate(iso: string) {
  if (!iso) return "—";
  try {
    return format(new Date(iso), "d MMMM yyyy", { locale: th });
  } catch {
    return iso;
  }
}

function InvoiceReceiptBody({ data, client }: Props) {
  const titles = DOCUMENT_TYPE_TITLES[data.document_type];
  const items = data.line_items.filter((i) => i.description.trim());
  const subtotal = sumLineItems(items);
  const vat = parseFloat(data.vat_amount || "0") || 0;
  const total = data.total_amount ?? subtotal + vat;
  const statusLabel =
    data.document_type === "receipt"
      ? "รับชำระแล้ว"
      : INVOICE_STATUS_LABELS[data.status as InvoiceStatus] ?? data.status;

  return (
    <div
      className="bg-white text-black text-[11px] leading-relaxed p-8 sm:p-10 min-h-[297mm]"
      style={{ fontFamily: "var(--font-ibm-plex), system-ui, sans-serif" }}
    >
      <div className="text-right mb-6">
        <p className="text-lg font-bold tracking-wide">{LCS_COMPANY.name}</p>
        <p className="text-base font-bold mt-1">
          {titles.th} / {titles.en}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-x-8 gap-y-2 mb-6 text-[11px]">
        <div>
          <p>
            <span className="font-semibold">เลขที่เอกสาร:</span> {data.doc_number}
          </p>
          <p>
            <span className="font-semibold">ผู้รับเงิน:</span> {LCS_COMPANY.payee}
          </p>
          <p>
            <span className="font-semibold">ลูกค้า:</span>{" "}
            {client?.name ?? client?.company ?? "—"}
          </p>
        </div>
        <div>
          <p>
            <span className="font-semibold">วันที่:</span> {formatDate(data.issue_date)}
          </p>
          <p>
            <span className="font-semibold">สถานะ:</span> {statusLabel}
          </p>
          <p>
            <span className="font-semibold">ช่องทางชำระเงิน:</span>{" "}
            {data.payment_method || "—"}
          </p>
        </div>
      </div>

      <table className="w-full border-collapse mb-4 text-[11px]">
        <thead>
          <tr className="bg-zinc-100">
            <th className="border border-zinc-300 px-2 py-1.5 w-10 text-center">ลำดับ</th>
            <th className="border border-zinc-300 px-2 py-1.5 text-left">รายการ</th>
            <th className="border border-zinc-300 px-2 py-1.5 w-20 text-center">จำนวน</th>
            <th className="border border-zinc-300 px-2 py-1.5 w-24 text-right">ราคาต่อหน่วย</th>
            <th className="border border-zinc-300 px-2 py-1.5 w-24 text-right">จำนวนเงิน</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <tr key={i}>
              <td className="border border-zinc-300 px-2 py-1.5 text-center">{i + 1}</td>
              <td className="border border-zinc-300 px-2 py-1.5">{item.description}</td>
              <td className="border border-zinc-300 px-2 py-1.5 text-center">
                {item.quantity} {item.unit}
              </td>
              <td className="border border-zinc-300 px-2 py-1.5 text-right">
                {formatMoney(item.unitPrice)}
              </td>
              <td className="border border-zinc-300 px-2 py-1.5 text-right">
                {formatMoney(lineItemAmount(item))}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={3} className="border border-zinc-300" />
            <td className="border border-zinc-300 px-2 py-1 text-right font-semibold">
              รวมเป็นเงิน
            </td>
            <td className="border border-zinc-300 px-2 py-1 text-right">
              {formatMoney(subtotal)} บาท
            </td>
          </tr>
          <tr>
            <td colSpan={3} className="border border-zinc-300" />
            <td className="border border-zinc-300 px-2 py-1 text-right font-semibold">
              ภาษีมูลค่าเพิ่ม
            </td>
            <td className="border border-zinc-300 px-2 py-1 text-right">
              {vat > 0 ? formatMoney(vat) : "-"}
            </td>
          </tr>
          <tr>
            <td colSpan={3} className="border border-zinc-300" />
            <td className="border border-zinc-300 px-2 py-1.5 text-right font-bold">
              ยอดสุทธิ
            </td>
            <td className="border border-zinc-300 px-2 py-1.5 text-right font-bold">
              {formatMoney(total)} บาท
            </td>
          </tr>
        </tfoot>
      </table>

      <p className="mb-4">
        <span className="font-semibold">จำนวนเงินตัวอักษร:</span>{" "}
        {data.amount_in_words || "—"}
      </p>

      {data.notes && (
        <p className="mb-4">
          <span className="font-semibold">หมายเหตุ:</span> {data.notes}
        </p>
      )}

      <table className="w-full border-collapse mb-8 text-[11px]">
        <tbody>
          <tr>
            <td className="border border-zinc-300 px-2 py-1 font-semibold w-32">รายละเอียดบัญชี</td>
            <td className="border border-zinc-300 px-2 py-1">ใช้สำหรับอ้างอิงการชำระเงิน</td>
          </tr>
          <tr>
            <td className="border border-zinc-300 px-2 py-1 font-semibold">ธนาคาร</td>
            <td className="border border-zinc-300 px-2 py-1">{LCS_COMPANY.bank}</td>
          </tr>
          <tr>
            <td className="border border-zinc-300 px-2 py-1 font-semibold">เลขบัญชี</td>
            <td className="border border-zinc-300 px-2 py-1">{LCS_COMPANY.accountNumber}</td>
          </tr>
          <tr>
            <td className="border border-zinc-300 px-2 py-1 font-semibold">ชื่อบัญชี</td>
            <td className="border border-zinc-300 px-2 py-1">{LCS_COMPANY.accountName}</td>
          </tr>
        </tbody>
      </table>

      <div className="grid grid-cols-2 gap-12 mt-12 text-center text-[11px]">
        <div>
          <p className="mb-12">{LCS_COMPANY.signerName}</p>
          <div className="border-t border-black pt-1 mx-8">
            <p>ผู้รับเงิน / {LCS_COMPANY.name}</p>
          </div>
        </div>
        <div>
          <p className="mb-12">&nbsp;</p>
          <div className="border-t border-black pt-1 mx-8">
            <p>ผู้ชำระเงิน / ลูกค้า</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProposalBody({ data, client }: Props) {
  const meta = data.document_meta as ProposalMeta;
  const titles = DOCUMENT_TYPE_TITLES.proposal;

  return (
    <div
      className="bg-white text-black text-[11px] leading-relaxed p-8 sm:p-10 min-h-[297mm] space-y-6"
      style={{ fontFamily: "var(--font-ibm-plex), system-ui, sans-serif" }}
    >
      <div className="text-center border-b border-zinc-300 pb-4">
        <p className="text-xs text-zinc-500">{LCS_COMPANY.name} | Project Proposal & Workflow</p>
        <p className="text-lg font-bold mt-2">{titles.th}</p>
        <p className="text-base font-semibold mt-2">{meta.projectName || data.title}</p>
        <p className="text-xs text-zinc-600 mt-1">
          จัดทำเพื่อเสนอแนวทางการพัฒนา พร้อม Workflow, Milestone และเงื่อนไขการชำระเงิน
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 text-[11px]">
        <p><span className="font-semibold">เลขที่เอกสาร:</span> {data.doc_number}</p>
        <p><span className="font-semibold">วันที่จัดทำ:</span> {formatDate(data.issue_date)}</p>
        <p><span className="font-semibold">ผู้รับจ้าง:</span> {LCS_COMPANY.name}</p>
        <p><span className="font-semibold">ลูกค้า:</span> {client?.name ?? "—"}</p>
        <p><span className="font-semibold">ประเภทงาน:</span> {meta.projectType}</p>
        <p><span className="font-semibold">ระยะเวลา:</span> {meta.durationDays} วัน (หลังมัดจำและข้อมูลครบ)</p>
      </div>

      <section>
        <h3 className="font-bold text-sm mb-2">2. ขอบเขตงานหลัก</h3>
        <table className="w-full border-collapse text-[10px]">
          <thead>
            <tr className="bg-zinc-100">
              <th className="border border-zinc-300 px-2 py-1 w-8">ลำดับ</th>
              <th className="border border-zinc-300 px-2 py-1 w-36">รายการงาน</th>
              <th className="border border-zinc-300 px-2 py-1">รายละเอียด</th>
            </tr>
          </thead>
          <tbody>
            {meta.scopeItems?.map((s) => (
              <tr key={s.no}>
                <td className="border border-zinc-300 px-2 py-1 text-center">{s.no}</td>
                <td className="border border-zinc-300 px-2 py-1">{s.title}</td>
                <td className="border border-zinc-300 px-2 py-1">{s.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h3 className="font-bold text-sm mb-2">4. Workflow การทำงาน</h3>
        <table className="w-full border-collapse text-[10px]">
          <thead>
            <tr className="bg-zinc-100">
              <th className="border border-zinc-300 px-2 py-1 w-8">ขั้น</th>
              <th className="border border-zinc-300 px-2 py-1 w-40">กิจกรรม</th>
              <th className="border border-zinc-300 px-2 py-1">ผลลัพธ์ที่ลูกค้าตรวจสอบได้</th>
            </tr>
          </thead>
          <tbody>
            {meta.workflowSteps?.map((w) => (
              <tr key={w.step}>
                <td className="border border-zinc-300 px-2 py-1 text-center">{w.step}</td>
                <td className="border border-zinc-300 px-2 py-1">{w.activity}</td>
                <td className="border border-zinc-300 px-2 py-1">{w.deliverable}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h3 className="font-bold text-sm mb-2">5. ระยะเวลาและ Milestone</h3>
        <table className="w-full border-collapse text-[10px]">
          <thead>
            <tr className="bg-zinc-100">
              <th className="border border-zinc-300 px-2 py-1">งวด</th>
              <th className="border border-zinc-300 px-2 py-1">งาน</th>
              <th className="border border-zinc-300 px-2 py-1">สิ่งที่ตรวจสอบได้</th>
              <th className="border border-zinc-300 px-2 py-1 w-24 text-right">ยอดชำระ</th>
            </tr>
          </thead>
          <tbody>
            {meta.milestones?.map((m, i) => (
              <tr key={i}>
                <td className="border border-zinc-300 px-2 py-1">{m.period}</td>
                <td className="border border-zinc-300 px-2 py-1">{m.work}</td>
                <td className="border border-zinc-300 px-2 py-1">{m.deliverable}</td>
                <td className="border border-zinc-300 px-2 py-1 text-right">
                  {m.percent}% = {formatMoney(m.amount)} บาท
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h3 className="font-bold text-sm mb-2">6. สรุปราคาและการชำระเงิน</h3>
        <table className="w-full border-collapse text-[10px]">
          <thead>
            <tr className="bg-zinc-100">
              <th className="border border-zinc-300 px-2 py-1">รายการ</th>
              <th className="border border-zinc-300 px-2 py-1 w-12">%</th>
              <th className="border border-zinc-300 px-2 py-1 w-24 text-right">จำนวนเงิน</th>
              <th className="border border-zinc-300 px-2 py-1">เงื่อนไข</th>
            </tr>
          </thead>
          <tbody>
            {meta.paymentTerms?.map((p, i) => (
              <tr key={i}>
                <td className="border border-zinc-300 px-2 py-1">{p.label}</td>
                <td className="border border-zinc-300 px-2 py-1 text-center">{p.percent}%</td>
                <td className="border border-zinc-300 px-2 py-1 text-right">{formatMoney(p.amount)} บาท</td>
                <td className="border border-zinc-300 px-2 py-1">{p.condition}</td>
              </tr>
            ))}
            <tr className="font-bold">
              <td className="border border-zinc-300 px-2 py-1">รวมทั้งสิ้น</td>
              <td className="border border-zinc-300 px-2 py-1 text-center">100%</td>
              <td className="border border-zinc-300 px-2 py-1 text-right">
                {formatMoney(meta.totalAmount)} บาท
              </td>
              <td className="border border-zinc-300 px-2 py-1">ราคาตาม Scope ในเอกสาร</td>
            </tr>
          </tbody>
        </table>
        <div className="mt-3 text-[10px] border border-zinc-300 p-2">
          <p><span className="font-semibold">บัญชีรับชำระ:</span> {LCS_COMPANY.bank} · {LCS_COMPANY.accountNumber} · {LCS_COMPANY.accountName}</p>
        </div>
      </section>

      {meta.conditions?.length > 0 && (
        <section>
          <h3 className="font-bold text-sm mb-2">7. เงื่อนไขและหมายเหตุ</h3>
          <ul className="list-disc pl-5 space-y-1 text-[10px]">
            {meta.conditions.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </section>
      )}

      {data.notes && (
        <p className="text-[10px] text-zinc-600 italic">{data.notes}</p>
      )}
    </div>
  );
}

function QuotationBody({ data, client }: Props) {
  const meta = data.document_meta as QuotationMeta;
  const titles = DOCUMENT_TYPE_TITLES.quotation;
  const recommended = meta.packages?.find((pack) => pack.recommended) ?? meta.packages?.[1];
  const deposit = recommended ? Math.round(recommended.price / 2) : 0;

  return (
    <div
      className="bg-white text-black text-[11px] leading-relaxed p-8 sm:p-10 min-h-[297mm] space-y-5"
      style={{ fontFamily: "var(--font-ibm-plex), system-ui, sans-serif" }}
    >
      <div className="flex items-start justify-between border-b border-zinc-300 pb-4">
        <div>
          <p className="text-lg font-bold tracking-wide">{LCS_COMPANY.name}</p>
          <p className="text-[10px] text-zinc-600">{meta.contact || `${LCS_COMPANY.phone} · LINE ${LCS_COMPANY.line}`}</p>
        </div>
        <div className="text-right">
          <p className="text-base font-bold">{titles.th} / {titles.en}</p>
          <p className="text-[10px] text-zinc-600 mt-1">{meta.headline}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-[11px]">
        <p><span className="font-semibold">เลขที่เอกสาร</span> {data.doc_number}</p>
        <p><span className="font-semibold">วันที่เสนอราคา</span> {formatDate(data.issue_date)}</p>
        <p><span className="font-semibold">ผู้เสนอราคา</span> {LCS_COMPANY.name} ({LCS_COMPANY.signerName})</p>
        <p><span className="font-semibold">ยืนราคา</span> {meta.validDays ?? 30} วัน</p>
        <p><span className="font-semibold">ลูกค้า</span> {client?.name ?? client?.company ?? "—"}</p>
        <p><span className="font-semibold">ช่องทาง</span> {client?.contact_phone || client?.contact_email || "—"}</p>
      </div>

      <section>
        <h3 className="font-bold text-sm mb-1">1. สรุปงาน</h3>
        <p>{meta.summary}</p>
        {meta.demoUrl && (
          <p className="mt-1">เดโมที่ส่งทดลองแล้ว: {meta.demoUrl}</p>
        )}
      </section>

      <section>
        <h3 className="font-bold text-sm mb-2">2. สรุปราคาแพ็กเกจ (จ่ายครั้งเดียว · รวมลงสโตร์)</h3>
        <table className="w-full border-collapse text-[10px]">
          <thead>
            <tr className="bg-zinc-100">
              <th className="border border-zinc-300 px-2 py-1.5 text-left">แพ็กเกจ</th>
              <th className="border border-zinc-300 px-2 py-1.5 text-left">เหมาะกับ</th>
              <th className="border border-zinc-300 px-2 py-1.5 text-right w-28">ราคาทั้งสิ้น</th>
            </tr>
          </thead>
          <tbody>
            {meta.packages?.map((pack) => (
              <tr key={pack.code} className={pack.recommended ? "bg-zinc-50 font-semibold" : ""}>
                <td className="border border-zinc-300 px-2 py-1.5">
                  {pack.code} · {pack.name}{pack.recommended ? " แนะนำ" : ""}
                </td>
                <td className="border border-zinc-300 px-2 py-1.5">{pack.suitableFor}</td>
                <td className="border border-zinc-300 px-2 py-1.5 text-right">{pack.price.toLocaleString("th-TH")} บาท</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-[10px] text-zinc-600">
          ราคาข้างต้นเป็นยอดรวมครั้งเดียว (พัฒนา + ตั้งค่า + ช่วยลงสโตร์) · ไม่รวมค่าบัญชีสโตร์ของลูกค้า และค่ารายเดือนโฮสต์ (ถ้าเลือกใช้)
        </p>
      </section>

      <section>
        <h3 className="font-bold text-sm mb-2">3. รายการที่ได้ในแต่ละแพ็กเกจ</h3>
        <div className="space-y-4">
          {meta.packages?.map((pack) => (
            <div key={pack.code} className="border border-zinc-300">
              <div className="flex items-baseline justify-between bg-zinc-100 px-3 py-2">
                <p className="font-bold">
                  {pack.code} · {pack.name}{pack.recommended ? " แนะนำ" : ""} {pack.price.toLocaleString("th-TH")} บาท
                </p>
                <p className="text-[10px] text-zinc-600">{pack.duration}</p>
              </div>
              <ul className="px-3 py-2 space-y-0.5">
                {pack.includes.map((item) => (
                  <li key={item} className="flex gap-2">
                    <span className="text-zinc-500">+</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3 className="font-bold text-sm mb-2">4. ค่าใช้จ่ายที่ลูกค้าจ่ายเอง (ไม่รวมในแพ็กเกจ)</h3>
        <table className="w-full border-collapse text-[10px]">
          <thead>
            <tr className="bg-zinc-100">
              <th className="border border-zinc-300 px-2 py-1 text-left">รายการ</th>
              <th className="border border-zinc-300 px-2 py-1 text-left">ใครจ่าย</th>
              <th className="border border-zinc-300 px-2 py-1 text-left">ประมาณการ</th>
            </tr>
          </thead>
          <tbody>
            {meta.customerPays?.map((row) => (
              <tr key={row.item}>
                <td className="border border-zinc-300 px-2 py-1">{row.item}</td>
                <td className="border border-zinc-300 px-2 py-1">{row.who}</td>
                <td className="border border-zinc-300 px-2 py-1">{row.estimate}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {meta.monthly?.length > 0 && (
        <section>
          <h3 className="font-bold text-sm mb-2">5. ค่าบริการรายเดือน (ถ้าให้เราดูแลโฮสต์ — ไม่บังคับ)</h3>
          <table className="w-full border-collapse text-[10px]">
            <thead>
              <tr className="bg-zinc-100">
                <th className="border border-zinc-300 px-2 py-1 text-left">รายการ</th>
                <th className="border border-zinc-300 px-2 py-1 text-left">แพ็กที่มักใช้</th>
                <th className="border border-zinc-300 px-2 py-1 text-right">ราคา/เดือน</th>
              </tr>
            </thead>
            <tbody>
              {meta.monthly.map((row) => (
                <tr key={row.item}>
                  <td className="border border-zinc-300 px-2 py-1">{row.item}</td>
                  <td className="border border-zinc-300 px-2 py-1">{row.packs}</td>
                  <td className="border border-zinc-300 px-2 py-1 text-right">{row.price.toLocaleString("th-TH")}</td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td className="border border-zinc-300 px-2 py-1" colSpan={2}>รวมรายเดือน (ถ้าเลือกครบ)</td>
                <td className="border border-zinc-300 px-2 py-1 text-right">
                  {meta.monthly.reduce((sum, row) => sum + row.price, 0).toLocaleString("th-TH")} บาท/เดือน
                </td>
              </tr>
            </tbody>
          </table>
          <p className="mt-1 text-[10px] text-zinc-600">เริ่มคิดหลังเปิดใช้งานจริง · ยกเลิกได้ (แจ้งล่วงหน้า 30 วัน) · ลูกค้าตั้งโฮสต์เองก็ได้</p>
        </section>
      )}

      <section>
        <h3 className="font-bold text-sm mb-1">เลือกยังไงดี</h3>
        <ul className="list-disc pl-5 space-y-0.5">
          {meta.chooseGuide?.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section>
        <h3 className="font-bold text-sm mb-2">6. เงื่อนไขการชำระเงิน (ตัวอย่างเมื่อเลือกแพ็กเกจ {recommended?.code ?? "B"})</h3>
        {recommended && (
          <table className="w-full border-collapse text-[10px]">
            <thead>
              <tr className="bg-zinc-100">
                <th className="border border-zinc-300 px-2 py-1 text-left">งวด</th>
                <th className="border border-zinc-300 px-2 py-1 text-right">ยอดชำระ</th>
                <th className="border border-zinc-300 px-2 py-1 text-left">เงื่อนไข</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-zinc-300 px-2 py-1">งวดที่ 1 — มัดจำ</td>
                <td className="border border-zinc-300 px-2 py-1 text-right">{deposit.toLocaleString("th-TH")} บาท</td>
                <td className="border border-zinc-300 px-2 py-1">50% เมื่อยืนยันตกลงรับงาน + เลือกแพ็กเกจ</td>
              </tr>
              <tr>
                <td className="border border-zinc-300 px-2 py-1">งวดที่ 2 — ก่อนส่งมอบ / ก่อนขึ้นสโตร์</td>
                <td className="border border-zinc-300 px-2 py-1 text-right">{deposit.toLocaleString("th-TH")} บาท</td>
                <td className="border border-zinc-300 px-2 py-1">ส่วนที่เหลือหลังตรวจงานครบ</td>
              </tr>
              <tr className="font-semibold">
                <td className="border border-zinc-300 px-2 py-1">รวมทั้งสิ้น (แพ็ก {recommended.code})</td>
                <td className="border border-zinc-300 px-2 py-1 text-right">{recommended.price.toLocaleString("th-TH")} บาท</td>
                <td className="border border-zinc-300 px-2 py-1">{meta.paymentNote}</td>
              </tr>
            </tbody>
          </table>
        )}
        <div className="mt-3 border border-zinc-300 p-2 text-[10px]">
          <p><span className="font-semibold">ช่องทางชำระเงิน:</span> ธนาคาร{LCS_COMPANY.bank}</p>
          <p>เลขที่บัญชี {LCS_COMPANY.accountNumber}</p>
          <p>ชื่อบัญชี {LCS_COMPANY.accountName}</p>
        </div>
      </section>

      <section>
        <h3 className="font-bold text-sm mb-1">7. หมายเหตุ</h3>
        <ul className="list-disc pl-5 space-y-1 text-[10px]">
          {meta.notes?.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <div className="grid grid-cols-2 gap-12 pt-8 text-center text-[11px]">
        <div>
          <p className="mb-14">{LCS_COMPANY.signerName}</p>
          <div className="border-t border-black pt-1 mx-6">
            <p>ผู้เสนอราคา / {LCS_COMPANY.name}</p>
          </div>
        </div>
        <div>
          <p className="mb-14">{client?.contact_name || client?.name || ""}</p>
          <div className="border-t border-black pt-1 mx-6">
            <p>ผู้อนุมัติ / ลูกค้า</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function AgreementBody({ data }: Pick<Props, "data">) {
  const meta = data.document_meta as AgreementMeta;
  const titles = DOCUMENT_TYPE_TITLES.agreement;

  return (
    <div
      className="bg-white text-black text-[11px] leading-relaxed p-8 sm:p-10 min-h-[297mm] space-y-5"
      style={{ fontFamily: "var(--font-ibm-plex), system-ui, sans-serif" }}
    >
      <div className="text-center border-b border-zinc-300 pb-4">
        <p className="text-[10px] tracking-wide text-zinc-500">
          {LCS_COMPANY.name.toUpperCase()} | CONTINUING TEAM AGREEMENT
        </p>
        <p className="text-[10px] text-zinc-500">
          {LCS_COMPANY.website} | LINE OA: {LCS_COMPANY.line}
        </p>
        <p className="text-lg font-bold mt-3">{titles.th}</p>
        <p className="text-xs font-semibold mt-1">{titles.en}</p>
        <p className="mt-2 text-[11px]">{meta.purpose}</p>
      </div>

      <section>
        <h3 className="font-bold text-sm mb-2">ข้อมูลข้อตกลง</h3>
        <div className="grid grid-cols-1 gap-1 border border-zinc-300 p-3">
          <p><span className="font-semibold">วันที่เริ่มมีผล</span> {meta.effectiveDate || "____________________________"}</p>
          <p><span className="font-semibold">ผู้แทน Limit Code Studio</span> {meta.representative || LCS_COMPANY.signerName}</p>
          <p><span className="font-semibold">ผู้ร่วมงาน</span> ตามรายชื่อและลายมือชื่อท้ายเอกสาร</p>
          <p><span className="font-semibold">ระยะเวลา</span> {meta.duration}</p>
          <p><span className="font-semibold">ช่องทางกลางของทีม</span> {meta.channel || "____________________________________________"}</p>
        </div>
        <p className="mt-2 text-[10px] text-zinc-600">{meta.usageNote}</p>
      </section>

      {meta.sections?.map((section) => (
        <section key={section.no}>
          <h3 className="font-bold text-sm mb-1">{section.no}. {section.title}</h3>
          <p>{section.body}</p>
          {section.callout && (
            <p className="mt-2 border border-zinc-300 bg-zinc-50 px-3 py-2 font-semibold">{section.callout}</p>
          )}
          {section.bullets && (
            <ul className="mt-2 list-disc pl-5 space-y-1">
              {section.bullets.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
        </section>
      ))}

      <section>
        <table className="w-full border-collapse text-[10px]">
          <thead>
            <tr className="bg-zinc-100">
              <th className="border border-zinc-300 px-2 py-1.5 text-left w-36">หัวข้อ</th>
              <th className="border border-zinc-300 px-2 py-1.5 text-left">หลักที่ใช้</th>
            </tr>
          </thead>
          <tbody>
            {meta.summaryRows?.map((row) => (
              <tr key={row.topic}>
                <td className="border border-zinc-300 px-2 py-1.5 font-semibold">{row.topic}</td>
                <td className="border border-zinc-300 px-2 py-1.5">{row.principle}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h3 className="font-bold text-sm mb-2">การยอมรับข้อตกลง</h3>
        <p className="mb-4">
          ผู้ลงนามรับทราบและเห็นชอบให้ใช้ข้อตกลงฉบับนี้เป็นกรอบการทำงานร่วมกันต่อเนื่องของ {LCS_COMPANY.name}
          และรับทราบว่าสัดส่วนค่าตอบแทนของแต่ละโครงการจะมีการตกลงและบันทึกเพิ่มเติมเป็นรายโครงการตามข้อ 4
        </p>
        <p className="font-semibold mb-2">ผู้แทน Limit Code Studio</p>
        <p className="mb-1">ชื่อ-นามสกุล ____________________________________________</p>
        <p className="mb-4">ลายมือชื่อ / วันที่ ____________________________________________</p>
        <p className="font-semibold mb-2">ผู้ร่วมงาน</p>
        <table className="w-full border-collapse text-[10px]">
          <thead>
            <tr className="bg-zinc-100">
              <th className="border border-zinc-300 px-2 py-1 w-10">ลำดับ</th>
              <th className="border border-zinc-300 px-2 py-1 text-left">ชื่อ-นามสกุล</th>
              <th className="border border-zinc-300 px-2 py-1 text-left w-36">บทบาทหลัก</th>
              <th className="border border-zinc-300 px-2 py-1 text-left w-40">ลายมือชื่อ / วันที่</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 6 }, (_, index) => (
              <tr key={index}>
                <td className="border border-zinc-300 px-2 py-2 text-center">{index + 1}</td>
                <td className="border border-zinc-300 px-2 py-2">{meta.signers?.[index]?.name || ""}</td>
                <td className="border border-zinc-300 px-2 py-2">{meta.signers?.[index]?.role && index > 0 ? meta.signers[index].role : ""}</td>
                <td className="border border-zinc-300 px-2 py-2" />
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-[10px] text-zinc-600">
          เอกสารฉบับนี้ตั้งใจให้ใช้เป็นกรอบการร่วมงานระยะยาว ส่วนรายละเอียด scope และ % ของแต่ละโครงการสามารถบันทึกเพิ่มเติมภายหลังได้โดยไม่ต้องจัดทำสัญญาหลักใหม่
        </p>
      </section>
    </div>
  );
}

export function LCSDocumentPreview({ data, client }: Props) {
  if (data.document_type === "quotation") {
    return <QuotationBody data={data} client={client} />;
  }
  if (data.document_type === "agreement") {
    return <AgreementBody data={data} />;
  }
  if (data.document_type === "proposal") {
    return <ProposalBody data={data} client={client} />;
  }
  return <InvoiceReceiptBody data={data} client={client} />;
}

export function printDocument() {
  window.print();
}
