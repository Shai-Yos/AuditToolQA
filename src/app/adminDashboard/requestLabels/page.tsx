import { requireAdmin } from "~/server/helpers/currentUser";
import { db } from "~/server/db";
import { parseDefaultRequestLabels } from "@/components/request-labels-shared";
import { saveDefaultRequestLabels } from "./actions";
import RequestLabelsUI from "@/app/adminDashboard/requestLabels/ui";

export const dynamic = "force-dynamic";

export default async function Page() {
  await requireAdmin();

  const config = await db.appConfig.findUnique({ where: { key: "defaultRequestLabels" } });
  const defaultLabels = parseDefaultRequestLabels(config?.value);

  return (
    <RequestLabelsUI
      defaultLabels={defaultLabels}
      saveDefaultRequestLabels={saveDefaultRequestLabels}
    />
  );
}