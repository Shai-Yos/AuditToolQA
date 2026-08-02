import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { requireUser } from "@/server/helpers/currentUser";

type NotifPrefs = {
  assignments: boolean;
  mentions: boolean;
  chat: boolean;
  requestActivity: boolean;
};

const DEFAULT_PREFS: NotifPrefs = {
  assignments: true,
  mentions: true,
  chat: true,
  requestActivity: true,
};

function parsePrefs(raw: string | null | undefined): NotifPrefs {
  if (!raw) return { ...DEFAULT_PREFS };
  try {
    const parsed = JSON.parse(raw) as Partial<NotifPrefs>;
    return {
      assignments: parsed.assignments ?? DEFAULT_PREFS.assignments,
      mentions: parsed.mentions ?? DEFAULT_PREFS.mentions,
      chat: parsed.chat ?? DEFAULT_PREFS.chat,
      requestActivity: parsed.requestActivity ?? DEFAULT_PREFS.requestActivity,
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

// GET /api/me/notif-preferences — return current user's notification preferences
export async function GET() {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Use raw SQL — notifPreferences was added after last prisma generate
  const rows = await db.$queryRaw<Array<{ notifPreferences: string | null }>>`
    SELECT [notifPreferences] FROM [dbo].[User] WHERE [id] = ${user.id}
  `;

  return NextResponse.json(parsePrefs(rows[0]?.notifPreferences));
}

// PUT /api/me/notif-preferences — update current user's notification preferences
export async function PUT(req: Request) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as Partial<NotifPrefs>;

  // Whitelist only the known preference keys
  const prefs: NotifPrefs = {
    assignments: typeof body.assignments === "boolean" ? body.assignments : DEFAULT_PREFS.assignments,
    mentions: typeof body.mentions === "boolean" ? body.mentions : DEFAULT_PREFS.mentions,
    chat: typeof body.chat === "boolean" ? body.chat : DEFAULT_PREFS.chat,
    requestActivity:
      typeof body.requestActivity === "boolean"
        ? body.requestActivity
        : DEFAULT_PREFS.requestActivity,
  };

  const json = JSON.stringify(prefs);
  // Use raw SQL — notifPreferences was added after last prisma generate
  await db.$executeRaw`
    UPDATE [dbo].[User] SET [notifPreferences] = ${json} WHERE [id] = ${user.id}
  `;

  return NextResponse.json(prefs);
}
