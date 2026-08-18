import { NextRequest, NextResponse } from "next/server";
import { join } from "path";
import { db } from "~/server/db";
import { revalidatePath } from "next/cache";
import { uploadFile } from "@/server/lib/oneDriveClient";
import { syncDocumentToPlanner, getDelegatedGraphToken } from "@/server/lib/planner";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ requestId: string }> }
) {
  try {
    const { requestId } = await params;
    const formData = await request.formData();
    const files = formData.getAll("files") as File[];
    const auditId = formData.get("auditId") as string;

    if (!files || files.length === 0) {
      return NextResponse.json(
        { error: "No files provided" },
        { status: 400 }
      );
    }

    // Verify request exists
    const existingRequest = await db.request.findUnique({
      where: { id: requestId },
    });

    if (!existingRequest) {
      return NextResponse.json(
        { error: "Request not found" },
        { status: 404 }
      );
    }

    // Build folder path: /AuditTool/Audits/[Audit name]/Requests/[Request name]/[file]
    const slugify = (s: string, fallback: string) =>
      s.trim().replace(/[\/\\:*?"<>|]/g, "_").substring(0, 100) || fallback;

    let auditTitle = "Unknown Audit";
    let auditSlug = "Unknown Audit";
    if (auditId) {
      const audit = await db.audit.findUnique({
        where: { id: auditId },
        select: { title: true, trackId: true },
      });
      auditTitle = audit?.trackId ? `${audit.trackId} ${audit.title}` : (audit?.title ?? auditId);
      auditSlug = slugify(auditTitle, auditId);
    }

    const requestTitle = existingRequest.trackNumber ?? existingRequest.title ?? requestId;
    const requestSlug = slugify(requestTitle, requestId);
    const localDir = join(process.cwd(), "public", "uploads", "Audits", auditSlug, "Requests", requestSlug);

    // Process each file
    const documentPromises = files.map(async (file) => {
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);

      const sanitizedFilename = file.name.replace(/[\/\\:*?"<>|]/g, "_");
      const filename = sanitizedFilename;

      // Upload to OneDrive: /AuditTool/Audits/[Audit name]/Requests/[Request name]/[file]
      const relativePath = `Audits/${auditTitle}/Requests/${requestTitle}/${filename}`;
      const apiUrlPath = `/api/uploads/Audits/${auditSlug}/Requests/${requestSlug}/${filename}`;

      const result = await uploadFile(buffer, relativePath, localDir, filename, apiUrlPath);

      // Create document record in database
      return db.document.create({
        data: {
          filename: file.name,
          url: result.url,
          requestId: requestId,
        },
      });
    });

    const documents = await Promise.all(documentPromises);

    // Pre-resolve the delegated token while still inside the request context
    // (cookies() is only valid during the request lifecycle)
    let plannerToken: string | undefined;
    try { plannerToken = await getDelegatedGraphToken(); } catch { /* not signed in or planner disabled */ }

    // Fire-and-forget: add OneDrive links to the Planner task (if configured)
    void Promise.allSettled(
      documents.map((doc) => syncDocumentToPlanner(requestId, doc.filename, doc.url, plannerToken)),
    );

    // Revalidate the request page to show new documents
    revalidatePath(`/adminDashboard/audits/${auditId}/requests/${requestId}`);

    return NextResponse.json({ success: true, documents });
  } catch (error) {
    console.error("Document upload error:", error);
    return NextResponse.json(
      { error: "Failed to upload documents" },
      { status: 500 }
    );
  }
}
