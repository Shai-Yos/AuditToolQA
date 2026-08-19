import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { listGroupMembers, listAllAzureUsers } from "@/server/lib/graphClient";
import { env } from "@/env";

// Azure AD group IDs (must match auth.ts / graphClient.ts)
const ADMIN_GROUPS = [
  "8c601df7-9839-4423-8ccc-03339bb5c6cb",
  "80e58a83-b7ae-4ca1-a583-d462add96e9b",
];

export async function GET(req: NextRequest) {
  // Verify the caller is authorised (Vercel cron sets Authorization: Bearer <CRON_SECRET>)
  const authHeader = req.headers.get("authorization");
  const secret = env.CRON_SECRET;
  if (secret && authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // 1. Fetch member OIDs for admin/operator groups only.
    const adminOids = await Promise.all(ADMIN_GROUPS.map(listGroupMembers)).then((sets) =>
      new Set(sets.flat()),
    );

    // 2. Fetch every Azure AD user (paginated)
    const azureUsers = await listAllAzureUsers();

    // 3. Upsert admin/operator users into the DB in batches to avoid timeouts on large tenants.
    let upserted = 0;
    let skipped = 0;

    type UpsertItem = { id: string; email: string; name: string; role: "ADMIN" };
    const toUpsert: UpsertItem[] = [];

    for (const u of azureUsers) {
      const email = u.mail ?? u.userPrincipalName;
      if (!email) { skipped++; continue; }

      if (!adminOids.has(u.id)) {
        // Not in an admin/operator group — leave them DB-managed only.
        skipped++;
        continue;
      }

      toUpsert.push({ id: u.id, email, name: u.displayName ?? email, role: "ADMIN" });
    }

    // Always upsert by email — it's the canonical unique key.
    // Process in chunks of 50 inside a transaction so each batch is atomic and
    // avoids holding a single long-lived transaction over the whole tenant.
    const CHUNK = 50;
    for (let i = 0; i < toUpsert.length; i += CHUNK) {
      const chunk = toUpsert.slice(i, i + CHUNK);
      try {
        await db.$transaction(
          chunk.map(({ id, email, name, role }) =>
            db.user.upsert({
              where: { email },
              update: { name, role },
              create: { id, email, name, role },
            }),
          ),
        );
        upserted += chunk.length;
      } catch {
        // If the whole chunk fails, fall back to individual upserts so one bad
        // record doesn't drop the rest of the batch.
        for (const { id, email, name, role } of chunk) {
          try {
            await db.user.upsert({
              where: { email },
              update: { name, role },
              create: { id, email, name, role },
            });
            upserted++;
          } catch {
            skipped++;
          }
        }
      }
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
