-- Rename StatusColumn table to RequestStatus (preserves all data)
ALTER TABLE "StatusColumn" RENAME TO "RequestStatus";

-- Rename statusColumnId column to requestStatusId in Request (preserves data)
ALTER TABLE "Request" RENAME COLUMN "statusColumnId" TO "requestStatusId";

-- Rename the unique constraint on RequestStatus
ALTER INDEX IF EXISTS "StatusColumn_auditId_order_key" RENAME TO "RequestStatus_auditId_order_key";

-- Rename indexes
DROP INDEX IF EXISTS "StatusColumn_auditId_idx";
CREATE INDEX IF NOT EXISTS "RequestStatus_auditId_idx" ON "RequestStatus"("auditId");

DROP INDEX IF EXISTS "Request_statusColumnId_idx";
CREATE INDEX IF NOT EXISTS "Request_requestStatusId_idx" ON "Request"("requestStatusId");

-- Add labels array column to Request (replaces label)
ALTER TABLE "Request" ADD COLUMN IF NOT EXISTS "labels" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Migrate existing label data into labels array
UPDATE "Request" SET "labels" = ARRAY["label"] WHERE "label" IS NOT NULL AND "label" != '';

-- Drop old label column
ALTER TABLE "Request" DROP COLUMN IF EXISTS "label";

-- Drop emailVerified from User
ALTER TABLE "User" DROP COLUMN IF EXISTS "emailVerified";
