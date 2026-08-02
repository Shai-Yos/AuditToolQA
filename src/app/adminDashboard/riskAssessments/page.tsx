import { requireAdmin } from "@/server/helpers/currentUser";
import { redirect } from "next/navigation";
import RiskAssessmentsUI from "@/components/risk-assessments/RiskAssessmentsUI";

export default async function AdminRiskAssessmentsPage() {
  try {
    await requireAdmin();
  } catch {
    redirect("/login");
  }

  return <RiskAssessmentsUI isAdmin />;
}
