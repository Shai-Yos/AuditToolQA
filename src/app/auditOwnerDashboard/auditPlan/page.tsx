import { requireAuditOwner } from "~/server/helpers/currentUser";
import { redirect } from "next/navigation";
import AuditPlanUI from "@/components/audit-plan/AuditPlanUI";

export default async function AuditOwnerAuditPlanPage() {
  try {
    await requireAuditOwner();
  } catch {
    redirect("/login");
  }

  return <AuditPlanUI />;
}
