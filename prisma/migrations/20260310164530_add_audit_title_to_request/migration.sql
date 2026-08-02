-- AlterTable
ALTER TABLE "RequestStatus" RENAME CONSTRAINT "StatusColumn_pkey" TO "RequestStatus_pkey";

-- RenameForeignKey
ALTER TABLE "Request" RENAME CONSTRAINT "Request_statusColumnId_fkey" TO "Request_requestStatusId_fkey";

-- RenameForeignKey
ALTER TABLE "RequestStatus" RENAME CONSTRAINT "StatusColumn_auditId_fkey" TO "RequestStatus_auditId_fkey";
