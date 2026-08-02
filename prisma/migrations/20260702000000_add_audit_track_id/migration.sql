-- Add trackId column to Audit table
ALTER TABLE [dbo].[Audit] ADD [trackId] NVARCHAR(20) NULL;

-- Back-fill and index via dynamic SQL to avoid parse-time column validation
EXEC sp_executesql N'
WITH numbered AS (
  SELECT
    id,
    YEAR(createdAt) AS yr,
    ROW_NUMBER() OVER (PARTITION BY YEAR(createdAt) ORDER BY createdAt ASC) AS seq
  FROM [dbo].[Audit]
  WHERE [trackId] IS NULL
)
UPDATE a
SET a.[trackId] = CAST(n.yr AS NVARCHAR(4)) + N''-'' + RIGHT(N''0000'' + CAST(n.seq AS NVARCHAR(4)), 4)
FROM [dbo].[Audit] a
JOIN numbered n ON a.id = n.id;

CREATE UNIQUE INDEX [Audit_trackId_key] ON [dbo].[Audit]([trackId]) WHERE [trackId] IS NOT NULL;
';
