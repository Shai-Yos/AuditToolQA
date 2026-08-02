import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { listGroupMembers, listAllAzureUsers } from "@/server/lib/graphClient";
import { env } from "@/env";

// Azure AD group IDs (must match auth.ts / graphClient.ts)
const ADMIN_GROUPS = [
  "8c601df7-9839-4423-8ccc-03339bb5c6cb",
  "80e58a83-b7ae-4ca1-a583-d462add96e9b",
];
const USER_GROUPS = ["e4ae5d7c-bf12-4d28-97d4-32a7d5d3a169"];

export async function GET(req: NextRequest) {
  // Verify the caller is authorised (Vercel cron sets Authorization: Bearer <CRON_SECRET>)
  const authHeader = req.headers.get("authorization");
  const secret = env.CRON_SECRET;
  if (secret && authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // 1. Fetch member OIDs for each group in parallel
    const [adminOids, userOids] = await Promise.all([
      Promise.all(ADMIN_GROUPS.map(listGroupMembers)).then((sets) =>
        new Set(sets.flat()),
      ),
      Promise.all(USER_GROUPS.map(listGroupMembers)).then((sets) =>
        new Set(sets.flat()),
      ),
    ]);

    // 2. Fetch every Azure AD user (paginated)
    const azureUsers = await listAllAzureUsers();

    // 3. Upsert each user into the DB
    let upserted = 0;
    let skipped = 0;

    for (const u of azureUsers) {
      const email = u.mail ?? u.userPrincipalName;
      if (!email) { skipped++; continue; }

      // Determine role: admin groups take priority
      let role: "ADMIN" | "USER";
      if (adminOids.has(u.id)) {
        role = "ADMIN";
      } else if (userOids.has(u.id)) {
        role = "USER";
      } else {
        // Not in any known group — skip (don't grant access to the app)
        skipped++;
        continue;
      }

      const name = u.displayName ?? email;

      // Always upsert by email — it's the canonical unique key.
      // If the user already exists in the DB (regardless of what id they have),
      // email finds them and we update name/role only.
      // If the user is new, create with Azure OID as the id so future sign-ins
      // can match by id directly.
      try {
        await db.user.upsert({
          where: { email },
          update: { name, role },
          create: { id: u.id, email, name, role },
        });
      } catch {
        skipped++;
        continue;
      }

      upserted++;
    }

    return NextResponse.json({
      ok: true,
      upserted,
      skipped,
      total: azureUsers.length,
    });
  } catch (err) {
    console.error("[sync-users] Error:", err);
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}
