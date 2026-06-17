import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

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
