import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import type { AccountingTransaction } from "./extras-types";
import type { AccountingSummary } from "./finance";

function sanitizeFilename(name: string): string {
  return name.replace(/[/\\?%*:|"<>]/g, "-").trim() || "document";
}

export function documentPdfFilename(docNumber?: string | null, fallback = "document"): string {
  return `${sanitizeFilename(docNumber || fallback)}.pdf`;
}

async function captureElement(element: HTMLElement): Promise<HTMLCanvasElement> {
  return html2canvas(element, {
    scale: 2,
    useCORS: true,
    backgroundColor: "#ffffff",
    logging: false,
    width: element.scrollWidth,
    height: element.scrollHeight,
    windowWidth: element.scrollWidth,
    windowHeight: element.scrollHeight,
  });
}

function canvasToPdf(canvas: HTMLCanvasElement, filename: string): void {
  const imgData = canvas.toDataURL("image/jpeg", 0.92);
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const imgHeight = (canvas.height * pageWidth) / canvas.width;

  let offsetY = 0;
  pdf.addImage(imgData, "JPEG", 0, offsetY, pageWidth, imgHeight, undefined, "FAST");

  let remaining = imgHeight - pageHeight;
  while (remaining > 0) {
    offsetY -= pageHeight;
    pdf.addPage();
    pdf.addImage(imgData, "JPEG", 0, offsetY, pageWidth, imgHeight, undefined, "FAST");
    remaining -= pageHeight;
  }

  pdf.save(filename.endsWith(".pdf") ? filename : `${filename}.pdf`);
}

export async function exportDocumentPdf(
  rootId: string,
  filename: string
): Promise<void> {
  const root = document.getElementById(rootId);
  if (!root) throw new Error("ไม่พบเอกสารสำหรับ export");

  const scrollParent = root.closest("#document-print-area") as HTMLElement | null;
  const prevMaxHeight = scrollParent?.style.maxHeight ?? "";
  const prevOverflow = scrollParent?.style.overflow ?? "";

  if (scrollParent) {
    scrollParent.style.maxHeight = "none";
    scrollParent.style.overflow = "visible";
  }

  try {
    const canvas = await captureElement(root);
    canvasToPdf(canvas, filename);
  } finally {
    if (scrollParent) {
      scrollParent.style.maxHeight = prevMaxHeight;
      scrollParent.style.overflow = prevOverflow;
    }
  }
}

function money(value: number) {
  return `฿${value.toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export function exportAccountingReportPdf(input: {
  periodLabel: string;
  summary: AccountingSummary;
  transactions: AccountingTransaction[];
}) {
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const margin = 14;
  let y = margin;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(16);
  pdf.text("Limit Code Studio — รายงานบัญชี", margin, y);
  y += 8;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(11);
  pdf.text(`ช่วงเวลา: ${input.periodLabel}`, margin, y);
  y += 10;

  const cards = [
    ["เงินเข้า", money(input.summary.income)],
    ["เงินออก", money(input.summary.expense)],
    ["คงเหลือ", money(input.summary.net)],
    ["กองกลาง", money(input.summary.fund)],
    ["VAT", money(input.summary.vat)],
  ];
  pdf.setFont("helvetica", "bold");
  cards.forEach(([label, value]) => {
    pdf.text(`${label}: ${value}`, margin, y);
    y += 6;
  });
  y += 4;

  pdf.setFont("helvetica", "bold");
  pdf.text("รายการ", margin, y);
  y += 6;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);

  for (const t of input.transactions) {
    if (y > 270) {
      pdf.addPage();
      y = margin;
    }
    const sign = t.type === "income" ? "+" : "-";
    const line1 = `${t.transaction_date}  ${sign}${money(t.amount)}  ${t.description}`;
    const line2 = `${t.category?.name ?? ""} · ${t.client?.name ?? t.member?.display_name ?? ""}`;
    pdf.text(line1.slice(0, 95), margin, y);
    y += 4;
    pdf.setTextColor(120);
    pdf.text(line2.slice(0, 95), margin, y);
    pdf.setTextColor(0);
    y += 5;
  }

  const filename = `accounting-${input.periodLabel.replace(/\s+/g, "-")}.pdf`;
  pdf.save(filename);
}
