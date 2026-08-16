import { requireRegulatoryImplementationAccess } from "@/server/helpers/currentUser";
import { redirect } from "next/navigation";
import RegulatoryImplementationUI from "@/components/regulatory-implementation/RegulatoryImplementationUI";

export default async function AdminRegulatoryImplementationPage() {
  let user;
  try {
    user = await requireRegulatoryImplementationAccess();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "Regulatory implementation access required") redirect("/adminDashboard");
    redirect("/login");
  }

  return <RegulatoryImplementationUI isAdmin={true} />;
}
