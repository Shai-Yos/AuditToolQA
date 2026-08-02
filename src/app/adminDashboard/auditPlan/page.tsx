import { requireAdmin } from "@/server/helpers/currentUser";
import { redirect } from "next/navigation";
import AuditPlanUI from "@/components/audit-plan/AuditPlanUI";

export default async function AdminAuditPlanPage() {
  try {
    await requireAdmin();
  } catch {
    redirect("/login");
  }

  return <AuditPlanUI isAdmin />;
}
