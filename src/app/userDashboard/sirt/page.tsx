import { requireUser } from "@/server/helpers/currentUser";
import { redirect } from "next/navigation";
import SIRTUI from "@/components/sirt/SIRTUI";

export default async function UserSIRTPage() {
  try {
    await requireUser();
  } catch {
    redirect("/login");
  }

  return <SIRTUI />;
}
