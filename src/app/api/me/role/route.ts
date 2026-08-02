import { auth } from "@/auth";
import { db } from "@/server/db";
import { NextResponse } from "next/server";

/**
 * Returns the user's current role from the DB (not from the JWT).
 * Clients poll this to detect role changes that haven't yet been reflected
 * in the user's JWT session.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, isActive: true },
  });

  if (!user) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    role: user.role,
    jwtRole: session.user.role,
    isActive: user.isActive,
  });
}
