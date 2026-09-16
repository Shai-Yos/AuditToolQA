import { requireUser } from "@/server/helpers/currentUser";
import { redirect } from "next/navigation";
import MiscellaneousUI from "@/components/miscellaneous/MiscellaneousUI";

export default async function UserMiscellaneousPage() {
  try {
    await requireUser();
  } catch {
    redirect("/login");
  }

  return <MiscellaneousUI />;
}
