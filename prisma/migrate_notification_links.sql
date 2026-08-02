ALTER TABLE [dbo].[Notification] ADD [linkAdmin] NVARCHAR(1000) NULL;
ALTER TABLE [dbo].[Notification] ADD [linkUser] NVARCHAR(1000) NULL;
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Notification') AND name = 'link')
  ALTER TABLE [dbo].[Notification] DROP COLUMN [link];
