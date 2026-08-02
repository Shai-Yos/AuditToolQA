import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { requireUser } from "@/server/helpers/currentUser";

// GET /api/notifications — list notifications for current user
export async function GET(req: Request) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const cursor = searchParams.get("cursor");
  const limit = Math.min(Number(searchParams.get("limit") ?? 20), 50);

  const notifications = await db.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hasMore = notifications.length > limit;
  if (hasMore) notifications.pop();

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const unreadCount = await db.notification.count({
    where: { userId: user.id, read: false, createdAt: { gte: todayStart } },
  });

  return NextResponse.json({
    notifications,
    unreadCount,
    nextCursor: hasMore ? notifications[notifications.length - 1]?.id : null,
  });
}

// PATCH /api/notifications — mark notifications as read
export async function PATCH(req: Request) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as { ids?: string[]; all?: boolean };

  if (body.all) {
    await db.notification.updateMany({
      where: { userId: user.id, read: false },
      data: { read: true },
    });
  } else if (body.ids && Array.isArray(body.ids) && body.ids.length > 0) {
    await db.notification.updateMany({
      where: { id: { in: body.ids }, userId: user.id },
      data: { read: true },
    });
  } else {
    return NextResponse.json({ error: "Provide ids or all:true" }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
