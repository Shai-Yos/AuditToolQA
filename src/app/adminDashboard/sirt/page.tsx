import { requireAdmin } from "@/server/helpers/currentUser";
import { redirect } from "next/navigation";
import SIRTUI from "@/components/sirt/SIRTUI";

export default async function AdminSIRTPage() {
  try {
    await requireAdmin();
  } catch {
    redirect("/login");
  }

  return <SIRTUI isAdmin />;
}
