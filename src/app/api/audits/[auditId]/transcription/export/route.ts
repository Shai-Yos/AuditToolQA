import { NextResponse } from "next/server";
import { requireUser } from "@/server/helpers/currentUser";
import { getCachedAuditPrivilege } from "@/server/lib/userPrivilegeCache";
import { exportTranscriptionChannel } from "@/server/helpers/transcriptionExport";

type Body = {
  channel?: string;
  force?: boolean;
};

export async function POST(
  req: Request,
  { params }: { params: Promise<{ auditId: string }> },
) {
  let user: Awaited<ReturnType<typeof requireUser>>;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { auditId } = await params;
  const body = (await req.json().catch(() => ({}))) as Body;
  const channel = body.channel;

  if (!channel || !channel.endsWith("-transcription")) {
    return NextResponse.json(
      { error: "A valid transcription channel is required" },
      { status: 400 },
    );
  }

  const privilege = await getCachedAuditPrivilege(user.id, auditId);
  const isAuditOwnerOfThis =
    user.role === "AUDIT_OWNER" && privilege.createdById === user.id;

  if (user.role !== "ADMIN" && !isAuditOwnerOfThis) {
    return NextResponse.json(
      { error: "Only admins or the audit owner can export transcription" },
      { status: 403 },
    );
  }

  const result = await exportTranscriptionChannel({
    auditId,
    channel,
    force: body.force === true,
  });

  if (result.status === "not-found") {
    return NextResponse.json(result, { status: 404 });
  }

  return NextResponse.json(result);
}
