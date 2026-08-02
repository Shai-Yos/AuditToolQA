import { requireAdmin } from "~/server/helpers/currentUser";
import { db } from "~/server/db";
import RequestStatusesUI from "./ui";
import { statusColors } from "@/components/audit-form/audit-form-shared";
import { saveDefaultStatuses } from "./actions";

const HARDCODED_DEFAULTS = [
  { name: "Incoming",     order: 1, color: statusColors[0]!.value },
  { name: "WIP",          order: 2, color: statusColors[1]!.value },
  { name: "Doc. Review",  order: 3, color: statusColors[2]!.value },
  { name: "Record Prep",  order: 4, color: statusColors[3]!.value },
  { name: "Ready for FR", order: 5, color: statusColors[4]!.value },
  { name: "In FR",        order: 6, color: statusColors[5]!.value },
  { name: "Closed",       order: 7, color: statusColors[6]!.value },
  { name: "Cancelled",    order: 8, color: statusColors[7]!.value },
  { name: "On Hold",      order: 9, color: statusColors[8]!.value },
];

export default async function Page() {
  await requireAdmin();

  const config = await db.appConfig.findUnique({ where: { key: "defaultStatusColumns" } });

  const defaultStatuses = config
    ? (JSON.parse(config.value) as Array<{ name: string; order: number; color: string }>)
    : HARDCODED_DEFAULTS;

  return (
    <RequestStatusesUI
      defaultStatuses={defaultStatuses}
      saveDefaultStatuses={saveDefaultStatuses}
    />
  );
}
