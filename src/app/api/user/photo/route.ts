import { auth } from "@/auth";
import { db } from "@/server/db";
import { getUserPhoto } from "@/server/lib/graphClient";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const user = await db.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, image: true },
  });

  if (!user) {
    return new NextResponse("No photo", { status: 404 });
  }

  let image = user.image;

  // null = never checked. Resolve from Graph synchronously (so the photo shows
  // up immediately instead of requiring a page refresh) and cache the result —
  // storing "" if the user has no Graph photo, so we never hit Graph again for
  // them. "" itself (already checked, no photo) falls straight through to 404.
  if (image === null) {
    const fetched = await getUserPhoto(user.id).catch(() => null);
    image = fetched;
    await db.user.update({ where: { id: user.id }, data: { image: fetched ?? "" } }).catch(() => {});
  }

  if (!image) {
    return new NextResponse("No photo", { status: 404 });
  }

  // If stored as data URL, extract raw bytes and content type
  const match = image.match(/^data:([^;]+);base64,(.+)$/);
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
  return NextResponse.redirect(image);
}
