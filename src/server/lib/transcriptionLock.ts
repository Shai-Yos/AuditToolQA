import { db } from "@/server/db";

const LOCK_TTL_MS = 30_000;
let ensureTablePromise: Promise<void> | null = null;

export type TranscriptionLockRecord = {
  lockedBy: string | null;
  lockedByName: string | null;
  lockedAt: Date | null;
};

export async function ensureTranscriptionLockTable(): Promise<void> {
  if (!ensureTablePromise) {
    ensureTablePromise = (async () => {
      await db.$executeRawUnsafe(`
        IF OBJECT_ID(N'[dbo].[TranscriptionLock]', N'U') IS NULL
        BEGIN
          CREATE TABLE [dbo].[TranscriptionLock] (
            [id] NVARCHAR(1000) NOT NULL,
            [auditId] NVARCHAR(1000) NOT NULL,
            [channel] NVARCHAR(1000) NOT NULL,
            [lockedBy] NVARCHAR(1000) NULL,
            [lockedByName] NVARCHAR(1000) NULL,
            [lockedAt] DATETIME2 NULL,
            [createdAt] DATETIME2 NOT NULL CONSTRAINT [TranscriptionLock_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
            [updatedAt] DATETIME2 NOT NULL,
            CONSTRAINT [TranscriptionLock_pkey] PRIMARY KEY ([id])
          );

          CREATE UNIQUE INDEX [TranscriptionLock_auditId_channel_key] ON [dbo].[TranscriptionLock]([auditId], [channel]);
          CREATE INDEX [TranscriptionLock_auditId_channel_idx] ON [dbo].[TranscriptionLock]([auditId], [channel]);
          ALTER TABLE [dbo].[TranscriptionLock] ADD CONSTRAINT [TranscriptionLock_auditId_fkey]
            FOREIGN KEY ([auditId]) REFERENCES [dbo].[Audit]([id]) ON DELETE CASCADE ON UPDATE CASCADE;
        END
      `);
    })().catch((error) => {
      ensureTablePromise = null;
      throw error;
    });
  }

  return ensureTablePromise;
}

export function isLockFresh(lockedAt: Date | null): boolean {
  if (!lockedAt) return false;
  return Date.now() - lockedAt.getTime() < LOCK_TTL_MS;
}

export async function getTranscriptionLock(auditId: string, channel: string): Promise<TranscriptionLockRecord | null> {
  await ensureTranscriptionLockTable();
  const rows = await db.$queryRaw<TranscriptionLockRecord[]>`
    SELECT TOP 1 [lockedBy], [lockedByName], [lockedAt]
    FROM [dbo].[TranscriptionLock]
    WHERE [auditId] = ${auditId} AND [channel] = ${channel}
  `;
  return rows[0] ?? null;
}

export async function acquireTranscriptionLock(auditId: string, channel: string, userId: string, userName: string): Promise<void> {
  await ensureTranscriptionLockTable();
  const now = new Date();
  const updated = await db.$executeRaw`
    UPDATE [dbo].[TranscriptionLock]
    SET [lockedBy] = ${userId}, [lockedByName] = ${userName}, [lockedAt] = ${now}, [updatedAt] = ${now}
    WHERE [auditId] = ${auditId} AND [channel] = ${channel}
  `;

  if (updated > 0) return;

  try {
    await db.$executeRaw`
      INSERT INTO [dbo].[TranscriptionLock] ([id], [auditId], [channel], [lockedBy], [lockedByName], [lockedAt], [createdAt], [updatedAt])
      VALUES (${crypto.randomUUID()}, ${auditId}, ${channel}, ${userId}, ${userName}, ${now}, ${now}, ${now})
    `;
  } catch {
    await db.$executeRaw`
      UPDATE [dbo].[TranscriptionLock]
      SET [lockedBy] = ${userId}, [lockedByName] = ${userName}, [lockedAt] = ${now}, [updatedAt] = ${now}
      WHERE [auditId] = ${auditId} AND [channel] = ${channel}
    `;
  }
}

export async function heartbeatTranscriptionLock(auditId: string, channel: string, userId: string): Promise<boolean> {
  await ensureTranscriptionLockTable();
  const now = new Date();
  const updated = await db.$executeRaw`
    UPDATE [dbo].[TranscriptionLock]
    SET [lockedAt] = ${now}, [updatedAt] = ${now}
    WHERE [auditId] = ${auditId} AND [channel] = ${channel} AND [lockedBy] = ${userId}
  `;
  return updated > 0;
}

export async function releaseTranscriptionLock(auditId: string, channel: string, userId: string): Promise<boolean> {
  await ensureTranscriptionLockTable();
  const released = await db.$executeRaw`
    UPDATE [dbo].[TranscriptionLock]
    SET [lockedBy] = NULL, [lockedByName] = NULL, [lockedAt] = NULL, [updatedAt] = ${new Date()}
    WHERE [auditId] = ${auditId} AND [channel] = ${channel} AND [lockedBy] = ${userId}
  `;
  return released > 0;
}

export async function forceReleaseTranscriptionLock(auditId: string, channel: string): Promise<void> {
  await ensureTranscriptionLockTable();
  await db.$executeRaw`
    UPDATE [dbo].[TranscriptionLock]
    SET [lockedBy] = NULL, [lockedByName] = NULL, [lockedAt] = NULL, [updatedAt] = ${new Date()}
    WHERE [auditId] = ${auditId} AND [channel] = ${channel}
  `;
}
