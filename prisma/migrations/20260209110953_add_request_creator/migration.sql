/*
  Warnings:

  - You are about to drop the `ChatMessage` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Pair` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `PairAssignment` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `TranscriptionNote` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Audit" DROP CONSTRAINT "Audit_createdById_fkey";

-- DropForeignKey
ALTER TABLE "ChatMessage" DROP CONSTRAINT "ChatMessage_pairId_fkey";

-- DropForeignKey
ALTER TABLE "ChatMessage" DROP CONSTRAINT "ChatMessage_userId_fkey";

-- DropForeignKey
ALTER TABLE "Pair" DROP CONSTRAINT "Pair_auditId_fkey";

-- DropForeignKey
ALTER TABLE "PairAssignment" DROP CONSTRAINT "PairAssignment_pairId_fkey";

-- DropForeignKey
ALTER TABLE "PairAssignment" DROP CONSTRAINT "PairAssignment_userId_fkey";

-- DropForeignKey
ALTER TABLE "TranscriptionNote" DROP CONSTRAINT "TranscriptionNote_pairId_fkey";

-- AlterTable
ALTER TABLE "Audit" ALTER COLUMN "createdById" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Request" ADD COLUMN     "createdById" TEXT;

-- AlterTable
ALTER TABLE "StatusColumn" ADD COLUMN     "color" TEXT NOT NULL DEFAULT '#3b82f6';

-- DropTable
DROP TABLE "ChatMessage";

-- DropTable
DROP TABLE "Pair";

-- DropTable
DROP TABLE "PairAssignment";

-- DropTable
DROP TABLE "TranscriptionNote";

-- DropEnum
DROP TYPE "PairSide";

-- AddForeignKey
ALTER TABLE "Audit" ADD CONSTRAINT "Audit_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Request" ADD CONSTRAINT "Request_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
