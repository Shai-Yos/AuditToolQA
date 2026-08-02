import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { requireUser } from "@/server/helpers/currentUser";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ auditId: string }> },
) {
  const { auditId } = await params;

  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = user.id;

  // Exclude items created by the current user so they don't see their own dots
  const [requestCount, assigneeCount, chatCount] = await Promise.all([
    db.request.count({ where: { auditId, createdById: { not: userId } } }),
    db.auditAssignee.count({ where: { auditId } }),
    db.chatMessage.count({ where: { auditId, authorId: { not: userId } } }),
  ]);

  return NextResponse.json({ requests: requestCount, kanban: requestCount, assignees: assigneeCount, chat: chatCount });
}
