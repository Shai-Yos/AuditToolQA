import { requireAuditOwner } from "~/server/helpers/currentUser";
import { redirect } from "next/navigation";
import SIRTUI from "@/components/sirt/SIRTUI";

export default async function AuditOwnerSIRTPage() {
  try {
    await requireAuditOwner();
  } catch {
    redirect("/login");
  }

  return <SIRTUI />;
}
