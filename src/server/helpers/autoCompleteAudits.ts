import { db } from "@/server/db";

/**
 * Automatically marks ACTIVE audits as COMPLETED when their end date has passed.
 * Called on dashboard page loads and via cron API route.
 */
export async function autoCompleteExpiredAudits() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  await db.audit.updateMany({
    where: {
      status: "ACTIVE",
      endAt: { lt: today },
    },
    data: {
      status: "COMPLETED",
    },
  });
}
