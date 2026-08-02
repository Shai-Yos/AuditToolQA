import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/server/db";

export async function GET(request: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim();

  if (!query || query.length < 2) {
    return NextResponse.json({ users: [] });
  }

  try {
    const users = await db.user.findMany({
      where: {
        OR: [
          { name: { contains: query } },
          { email: { contains: query } },
        ],
      },
      take: 20,
      select: { id: true, name: true, email: true, image: true },
    });
    return NextResponse.json({ users });
  } catch (err) {
    console.error("User search failed:", err);
    return NextResponse.json({ error: "Failed to search users" }, { status: 500 });
  }
}
