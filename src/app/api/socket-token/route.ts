import { NextResponse } from "next/server";
import { requireUser } from "@/server/helpers/currentUser";
import { issueSocketToken } from "@/server/lib/socketAuthTokens";

/** Issues a short-lived, single-use token the client exchanges for a Socket.IO connection. */
export async function GET() {
  let user: Awaited<ReturnType<typeof requireUser>>;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = issueSocketToken(user.id);
  return NextResponse.json({ token });
}
