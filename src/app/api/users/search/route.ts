import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/server/db";
import { getUserPhotosBatch, searchUsers } from "@/server/lib/graphClient";

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
    const azureUsers = await searchUsers(query);
    const ids = azureUsers.map((u) => u.id);

    const dbRows = ids.length
      ? await db.user.findMany({
          where: { id: { in: ids } },
          select: { id: true, image: true },
        })
      : [];

    const dbMap = new Map(dbRows.map((u) => [u.id, u.image] as const));
    const photoMap = new Map<string, string | null>();
    for (const [id, image] of dbMap) {
      photoMap.set(id, image || null);
    }

    const missingIds = ids.filter((id) => {
      const dbImage = dbMap.get(id);
      return dbImage === undefined || dbImage === null;
    });

    const graphPhotos = await getUserPhotosBatch(missingIds);
    for (const [id, photo] of graphPhotos) {
      if (photo) {
        photoMap.set(id, photo);
      }
    }

    await Promise.all(
      [...graphPhotos.entries()]
        .filter(([id]) => dbMap.has(id))
        .map(([id, photo]) => db.user.update({ where: { id }, data: { image: photo } }).catch(() => {})),
    );

    const users = azureUsers.slice(0, 20).map((u) => ({
      id: u.id,
      name: u.displayName,
      email: u.mail ?? u.userPrincipalName,
      image: photoMap.get(u.id) ?? null,
    }));

    return NextResponse.json({ users });
  } catch {
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
    return NextResponse.json({ users: users.map((u) => ({ ...u, image: u.image ?? null })) });
  }
}
