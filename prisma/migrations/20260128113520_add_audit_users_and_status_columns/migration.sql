-- AlterTable
ALTER TABLE "Audit" ADD COLUMN     "description" TEXT,
ADD COLUMN     "endAt" TIMESTAMP(3),
ADD COLUMN     "startAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "AuditAssignee" (
    "id" TEXT NOT NULL,
    "auditId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditAssignee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StatusColumn" (
    "id" TEXT NOT NULL,
    "auditId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StatusColumn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditAssignee_userId_idx" ON "AuditAssignee"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AuditAssignee_auditId_userId_key" ON "AuditAssignee"("auditId", "userId");

-- CreateIndex
CREATE INDEX "StatusColumn_auditId_idx" ON "StatusColumn"("auditId");

-- CreateIndex
CREATE UNIQUE INDEX "StatusColumn_auditId_order_key" ON "StatusColumn"("auditId", "order");

-- AddForeignKey
ALTER TABLE "AuditAssignee" ADD CONSTRAINT "AuditAssignee_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "Audit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditAssignee" ADD CONSTRAINT "AuditAssignee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatusColumn" ADD CONSTRAINT "StatusColumn_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "Audit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
