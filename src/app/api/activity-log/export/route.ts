import { db } from "@/server/db";
import { requireAdmin } from "@/server/helpers/currentUser";
import * as XLSX from "xlsx";
import { NextResponse } from "next/server";

const TYPE_LABELS: Record<string, string> = {
  AUDIT_CREATED: "Audit Created",
  AUDIT_UPDATED: "Audit Updated",
  AUDIT_ARCHIVED: "Audit Archived",
  REQUEST_CREATED: "Request Created",
  REQUEST_UPDATED: "Request Updated",
  REQUEST_MOVED: "Request Moved",
  REQUEST_CANCELLED: "Request Cancelled",
  REQUEST_DELETED: "Request Deleted",
  USER_ASSIGNED_REQUEST: "User Assigned to Request",
  USER_UNASSIGNED_REQUEST: "User Removed from Request",
  USER_ASSIGNED_AUDIT: "User Assigned to Audit",
  USER_UNASSIGNED_AUDIT: "User Removed from Audit",
  USER_ROLE_UPDATED_AUDIT: "User Role Updated in Audit",
  ACCESS_REQUEST_SUBMITTED: "Access Request Submitted",
  ACCESS_REQUEST_APPROVED: "Access Request Approved",
  ACCESS_REQUEST_REJECTED: "Access Request Rejected",
};

export async function GET(req: Request) {
  await requireAdmin();

  const { searchParams } = new URL(req.url);
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");
  const preset = searchParams.get("preset"); // today | week | month | alltime

  const where: { createdAt?: { gte?: Date; lte?: Date } } = {};
  if (fromParam ?? toParam) {
    where.createdAt = {};
    if (fromParam) where.createdAt.gte = new Date(fromParam);
    if (toParam) where.createdAt.lte = new Date(toParam);
  }

  const logs = await db.activityLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      action: true,
      actorName: true,
      targetTitle: true,
      meta: true,
      createdAt: true,
    },
  });

  const rows = logs.map((log) => {
    let metaParsed: Record<string, string> = {};
    try {
      if (log.meta) metaParsed = JSON.parse(log.meta) as Record<string, string>;
    } catch {
      /* ignore malformed meta */
    }

    return {
      Date: `${log.createdAt.toLocaleString(undefined, { timeZone: "UTC" })} UTC`,
      Action: TYPE_LABELS[log.action] ?? log.action,
      "Performed By": log.actorName,
      Target: log.targetTitle,
      Details: Object.entries(metaParsed)
        .map(([k, v]) => `${k}: ${v}`)
        .join(", "),
    };
  });

  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = [
    { wch: 20 }, // Date
    { wch: 20 }, // Action
    { wch: 30 }, // Performed By
    { wch: 40 }, // Target
    { wch: 50 }, // Details
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Activity Log");

  const base64 = XLSX.write(wb, { type: "base64", bookType: "xlsx" }) as string;
  const bytes = Buffer.from(base64, "base64");
  const blob = new Blob([bytes], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const MONTH_NAMES = ["january","february","march","april","may","june","july","august","september","october","november","december"];

  let rangeTag: string;
  if (preset === "today") {
    rangeTag = `_${today}`;
  } else if (preset === "week") {
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 7);
    rangeTag = `_${weekAgo.toISOString().slice(0, 10)}_to_${today}`;
  } else if (preset === "month") {
    rangeTag = `_${MONTH_NAMES[now.getMonth()] ?? today}`;
  } else {
    rangeTag = `_alltime`;
  }

  return new NextResponse(blob, {
    headers: {
      "Content-Disposition": `attachment; filename="activity-log${rangeTag}.xlsx"`,
    },
  });
}
