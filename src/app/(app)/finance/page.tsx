import { Suspense } from "react";
import { PageLoader } from "@/components/ui";
import FinancePageInner from "./FinancePageInner";

export default function FinancePage() {
  return (
    <Suspense
      fallback={<PageLoader label="กำลังเปิดหน้าการเงิน..." />}
    >
      <FinancePageInner />
    </Suspense>
  );
}
