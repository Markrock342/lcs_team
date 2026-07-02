"use client";

import Image from "next/image";
import { ExternalLink } from "lucide-react";
import { Modal } from "@/components/ui";

type Props = {
  open: boolean;
  url: string | null;
  fileName?: string | null;
  onClose: () => void;
};

function isPdf(url: string, fileName?: string | null) {
  const target = (fileName ?? url).toLowerCase();
  return target.endsWith(".pdf");
}

export function SlipPreviewModal({ open, url, fileName, onClose }: Props) {
  if (!open || !url) return null;

  return (
    <Modal open={open} onClose={onClose} title="ดูสลิป / หลักฐาน">
      <div className="space-y-3">
        {isPdf(url, fileName) ? (
          <iframe
            src={url}
            title={fileName ?? "slip"}
            className="w-full h-[60vh] rounded-xl border border-border bg-background"
          />
        ) : (
          <div className="relative w-full min-h-[40vh] max-h-[65vh] rounded-xl overflow-hidden border border-border bg-background">
            <Image
              src={url}
              alt={fileName ?? "slip"}
              width={800}
              height={1000}
              className="w-full h-auto object-contain"
              unoptimized
            />
          </div>
        )}
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-sm text-accent hover:underline"
        >
          <ExternalLink size={14} /> เปิดในแท็บใหม่
        </a>
      </div>
    </Modal>
  );
}
