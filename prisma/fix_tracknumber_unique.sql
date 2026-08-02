-- Drop old global unique constraint on trackNumber
IF EXISTS (SELECT 1 FROM sys.key_constraints WHERE name = 'Request_trackNumber_key' AND type = 'UQ')
    ALTER TABLE [dbo].[Request] DROP CONSTRAINT [Request_trackNumber_key];

-- Add composite unique constraint (per audit)
IF NOT EXISTS (SELECT 1 FROM sys.key_constraints WHERE name = 'Request_auditId_trackNumber_key' AND type = 'UQ')
    ALTER TABLE [dbo].[Request] ADD CONSTRAINT [Request_auditId_trackNumber_key] UNIQUE ([auditId], [trackNumber]);
