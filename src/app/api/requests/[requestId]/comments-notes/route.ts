import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ requestId: string }> }
) {
  const { requestId } = await params;

  const [commentsRaw, request] = await Promise.all([
    db.requestComment.findMany({
      where: { requestId },
      orderBy: { createdAt: "asc" },
    }),
    db.request.findUnique({
      where: { id: requestId },
      select: {
        noteText: true,
        noteLastEditedAt: true,
        noteLastEditedBy: true,
      },
    }),
  ]);

  const comments = commentsRaw.map((c) => ({
    id: c.id,
    authorId: c.authorId,
    authorName: c.authorName,
    authorImage: c.authorImage,
    text: c.text,
    createdAt: c.createdAt.toISOString(),
  }));

  return NextResponse.json({
    comments,
    note: {
      text: request?.noteText ?? "",
      lastEditedBy: request?.noteLastEditedBy ?? null,
      lastEditedAt: request?.noteLastEditedAt?.toISOString() ?? null,
    },
  });
}
