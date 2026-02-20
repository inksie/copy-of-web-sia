import { ProtectedLayout } from "@/components/layout/ProtectedLayout";
import Templates from "@/components/pages/TemplatesNew";

export const metadata = {
  title: "Templates - SIA",
};

export default function TemplatesPage() {
  return (
    <ProtectedLayout>
      <Templates />
    </ProtectedLayout>
  );
}
