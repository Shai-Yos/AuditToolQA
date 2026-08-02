import { auth } from "@/auth";
import { db } from "@/server/db";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const user = await db.user.findUnique({
    where: { email: session.user.email },
    select: { image: true },
  });

  if (!user?.image) {
    return new NextResponse("No photo", { status: 404 });
  }

  // If stored as data URL, extract raw bytes and content type
  const match = user.image.match(/^data:([^;]+);base64,(.+)$/);
  if (match) {
    const contentType = match[1]!;
    const buffer = Buffer.from(match[2]!, "base64");
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=3600",
      },
    });
  }

  // Plain URL fallback
  return NextResponse.redirect(user.image);
}
