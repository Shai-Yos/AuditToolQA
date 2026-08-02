import { requireUser } from "@/server/helpers/currentUser";
import { redirect } from "next/navigation";
import AuditPlanUI from "@/components/audit-plan/AuditPlanUI";

export default async function UserAuditPlanPage() {
  try {
    await requireUser();
  } catch {
    redirect("/login");
  }

  return <AuditPlanUI />;
}
