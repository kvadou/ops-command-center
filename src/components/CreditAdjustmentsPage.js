import CreditAdjustmentsSummary from "./CreditAdjustmentsSummary";
import CreditAdjustmentsTable from "./CreditAdjustmentsTable";

export default function CreditAdjustmentsPage() {
  return (
      <div className="max-w-7xl mx-auto w-full space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">Credit & Balance Adjustments</h1>
          <p className="text-sm text-neutral-500 mt-1">Track and categorize all credits given to clients</p>
        </div>
        <CreditAdjustmentsSummary />
        <CreditAdjustmentsTable />
      </div>
  );
}
