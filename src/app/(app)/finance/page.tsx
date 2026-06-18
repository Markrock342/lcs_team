import { Suspense } from "react";
import FinancePageInner from "./FinancePageInner";

export default function FinancePage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-32">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <FinancePageInner />
    </Suspense>
  );
}
