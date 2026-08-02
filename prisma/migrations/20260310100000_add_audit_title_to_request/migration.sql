-- Add denormalized auditTitle to Request
ALTER TABLE "Request" ADD COLUMN "auditTitle" TEXT NOT NULL DEFAULT '';

-- Backfill existing rows from the Audit table
UPDATE "Request" r
SET "auditTitle" = a.title
FROM "Audit" a
WHERE r."auditId" = a.id;
