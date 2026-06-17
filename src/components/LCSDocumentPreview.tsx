"use client";

import {
  DOCUMENT_TYPE_TITLES,
  LCS_COMPANY,
  formatMoney,
  lineItemAmount,
  sumLineItems,
  type DocumentFormData,
  type ProposalMeta,
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

export function LCSDocumentPreview({ data, client }: Props) {
  if (data.document_type === "proposal") {
    return <ProposalBody data={data} client={client} />;
  }
  return <InvoiceReceiptBody data={data} client={client} />;
}

export function printDocument() {
  window.print();
}
