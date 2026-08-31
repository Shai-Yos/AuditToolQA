-- SQL Server treats NULL as a value for unfiltered UNIQUE indexes.
-- Keep Planner task IDs unique only when they exist, while allowing many NULL rows.
IF EXISTS (
  SELECT 1
  FROM sys.key_constraints
  WHERE [name] = 'Request_plannerTaskId_key'
    AND [parent_object_id] = OBJECT_ID('dbo.Request')
)
BEGIN
  ALTER TABLE [dbo].[Request] DROP CONSTRAINT [Request_plannerTaskId_key];
END;

IF EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE [name] = 'Request_plannerTaskId_key'
    AND [object_id] = OBJECT_ID('dbo.Request')
)
BEGIN
  DROP INDEX [Request_plannerTaskId_key] ON [dbo].[Request];
END;

CREATE UNIQUE INDEX [Request_plannerTaskId_key]
ON [dbo].[Request]([plannerTaskId])
WHERE [plannerTaskId] IS NOT NULL;
