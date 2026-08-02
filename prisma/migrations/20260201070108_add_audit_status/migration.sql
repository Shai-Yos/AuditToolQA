-- CreateEnum
CREATE TYPE "AuditStatus" AS ENUM ('DRAFT', 'ACTIVE', 'COMPLETED');

-- AlterTable
ALTER TABLE "Audit" ADD COLUMN     "status" "AuditStatus" NOT NULL DEFAULT 'DRAFT';
