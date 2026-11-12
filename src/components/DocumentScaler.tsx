"use client";

import { useEffect, useRef, useState } from "react";

/** ความกว้างของแผ่นเอกสารตอนแสดงใน Modal บนเดสก์ท็อป — ใช้เป็นความกว้างอ้างอิงทุกอุปกรณ์ */
const SHEET_WIDTH = 470;

/**
 * จัดแผ่นเอกสารที่ความกว้างคงที่ แล้วย่อทั้งแผ่นให้พอดีจอมือถือ
 * ตารางจึงไม่ถูกบีบ และ PDF ที่ส่งออกจากมือถือหน้าตาเหมือนเดสก์ท็อป
 */
export function DocumentScaler({ children }: { children: React.ReactNode }) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const update = () => setZoom(Math.min(1, frame.clientWidth / SHEET_WIDTH));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={frameRef} className="w-full overflow-hidden">
      <div
        className="doc-scaler"
        style={{ "--doc-zoom": zoom, "--doc-width": `${SHEET_WIDTH}px` } as React.CSSProperties}
      >
        {children}
      </div>
    </div>
  );
}
