import { requireAuditOwner } from "~/server/helpers/currentUser";
import { redirect } from "next/navigation";
import RiskAssessmentsUI from "@/components/risk-assessments/RiskAssessmentsUI";

export default async function AuditOwnerRiskAssessmentsPage() {
  try {
    await requireAuditOwner();
  } catch {
    redirect("/login");
  }

  return <RiskAssessmentsUI />;
}
