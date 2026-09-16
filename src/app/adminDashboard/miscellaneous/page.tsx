import { requireAdmin } from "@/server/helpers/currentUser";
import { redirect } from "next/navigation";
import MiscellaneousUI from "@/components/miscellaneous/MiscellaneousUI";

export default async function AdminMiscellaneousPage() {
  try {
    await requireAdmin();
  } catch {
    redirect("/login");
  }

  return <MiscellaneousUI isAdmin />;
}
