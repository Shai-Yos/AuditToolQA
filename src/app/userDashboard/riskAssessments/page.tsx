import { requireUser } from "@/server/helpers/currentUser";
import { redirect } from "next/navigation";
import RiskAssessmentsUI from "@/components/risk-assessments/RiskAssessmentsUI";

export default async function UserRiskAssessmentsPage() {
  try {
    await requireUser();
  } catch {
    redirect("/login");
  }

  return <RiskAssessmentsUI />;
}
