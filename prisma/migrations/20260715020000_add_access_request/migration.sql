CREATE TABLE [dbo].[AccessRequest] (
    [id] NVARCHAR(1000) NOT NULL,
    [email] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [requestedRole] NVARCHAR(1000) NOT NULL CONSTRAINT [AccessRequest_requestedRole_df] DEFAULT 'USER',
    [reason] NVARCHAR(MAX),
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [AccessRequest_status_df] DEFAULT 'PENDING',
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [AccessRequest_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [reviewedAt] DATETIME2,
    [reviewedById] NVARCHAR(1000),
    [reviewedByName] NVARCHAR(1000),
    [reviewNote] NVARCHAR(MAX),
    CONSTRAINT [AccessRequest_pkey] PRIMARY KEY CLUSTERED ([id])
);
