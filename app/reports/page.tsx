import { ProtectedLayout } from "@/components/layout/ProtectedLayout";
import Reports from "@/components/pages/Reports";

export const metadata = {
  title: "Reports - SIA",
};

export default function ReportsPage() {
  return (
    <ProtectedLayout>
      <Reports />
    </ProtectedLayout>
  );
}
