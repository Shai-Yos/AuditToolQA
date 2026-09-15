-- CreateTable
CREATE TABLE [dbo].[TranscriptionLock] (
    [id] NVARCHAR(1000) NOT NULL,
    [auditId] NVARCHAR(1000) NOT NULL,
    [channel] NVARCHAR(1000) NOT NULL,
    [lockedBy] NVARCHAR(1000),
    [lockedByName] NVARCHAR(1000),
    [lockedAt] DATETIME2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [TranscriptionLock_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,

    CONSTRAINT [TranscriptionLock_pkey] PRIMARY KEY ([id])
);

-- CreateIndex
CREATE UNIQUE INDEX [TranscriptionLock_auditId_channel_key] ON [dbo].[TranscriptionLock]([auditId], [channel]);

-- CreateIndex
CREATE INDEX [TranscriptionLock_auditId_channel_idx] ON [dbo].[TranscriptionLock]([auditId], [channel]);

-- AddForeignKey
ALTER TABLE [dbo].[TranscriptionLock] ADD CONSTRAINT [TranscriptionLock_auditId_fkey] FOREIGN KEY ([auditId]) REFERENCES [dbo].[Audit]([id]) ON DELETE CASCADE ON UPDATE CASCADE;
