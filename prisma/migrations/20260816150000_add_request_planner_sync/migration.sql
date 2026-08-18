ALTER TABLE [dbo].[Request] ADD [plannerTaskId] NVARCHAR(1024) NULL;
ALTER TABLE [dbo].[Request] ADD [plannerSyncedAt] DATETIME2 NULL;
ALTER TABLE [dbo].[Request] ADD [plannerSyncError] NVARCHAR(2000) NULL;

CREATE UNIQUE INDEX [Request_plannerTaskId_key] ON [dbo].[Request]([plannerTaskId]);
