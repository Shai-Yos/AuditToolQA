import { NextRequest, NextResponse } from "next/server";
import { join } from "path";
import { db } from "~/server/db";
import { revalidatePath } from "next/cache";
import {
  isOneDriveUrl,
  extractDrivePath,
  deleteOneDriveFile,
  deleteLocalFile,
} from "@/server/lib/oneDriveClient";
import { requireUser } from "~/server/helpers/currentUser";
import { canUserEditWithLock, lockDeniedMessage } from "~/server/lib/requestLockPermissions";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ requestId: string; documentId: string }> }
) {
  try {
    const currentUser = await requireUser();
    const { requestId, documentId } = await params;
    const url = new URL(request.url);
    const auditId = url.searchParams.get("auditId");

    const [document, requestLock] = await Promise.all([
      db.document.findUnique({
        where: { id: documentId },
      }),
      db.request.findUnique({
        where: { id: requestId },
        select: { lockedBy: true, lockedByName: true, lockedAt: true },
      }),
    ]);

    if (!document) {
      return NextResponse.json(
        { error: "Document not found" },
        { status: 404 }
      );
    }

    if (!requestLock) {
      return NextResponse.json(
        { error: "Request not found" },
        { status: 404 },
      );
    }

    if (!canUserEditWithLock(requestLock, currentUser.id)) {
      return NextResponse.json(
        { error: lockDeniedMessage(requestLock.lockedByName) },
        { status: 423 },
      );
    }

    // Verify it belongs to the request
    if (document.requestId !== requestId) {
      return NextResponse.json(
        { error: "Document does not belong to this request" },
        { status: 403 }
      );
    }

    // Delete the file from storage
    if (isOneDriveUrl(document.url)) {
      const drivePath = extractDrivePath(document.url);
      await deleteOneDriveFile(drivePath);
    } else {
      // Local file: url is like /api/uploads/slug/requests/reqSlug/file.pdf
      // Convert to filesystem path
      const relativePath = document.url.replace(/^\/api\/uploads\//, "");
      const filepath = join(process.cwd(), "public", "uploads", relativePath);
      await deleteLocalFile(filepath);
    }

    // Delete from database
    await db.document.delete({
      where: { id: documentId },
    });

    // Revalidate the request page
    if (auditId) {
      revalidatePath(`/adminDashboard/audits/${auditId}/requests/${requestId}`);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Document delete error:", error);
    return NextResponse.json(
      { error: "Failed to delete document" },
      { status: 500 }
    );
  }
}
