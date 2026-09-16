import { requireAuditOwner } from "~/server/helpers/currentUser";
import { redirect } from "next/navigation";
import MiscellaneousUI from "@/components/miscellaneous/MiscellaneousUI";

export default async function AuditOwnerMiscellaneousPage() {
  try {
    await requireAuditOwner();
  } catch {
    redirect("/login");
  }

  return <MiscellaneousUI />;
}
