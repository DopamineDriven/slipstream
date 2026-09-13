-- CreateEnum
CREATE TYPE "DictationTerminationReason" AS ENUM ('USER_FINISHED', 'IDLE_TIMEOUT', 'USER_CANCELED', 'CLIENT_DISCONNECTED', 'UPSTREAM_ERROR', 'INTERNAL_ERROR', 'NONE');

-- AlterEnum
ALTER TYPE "DictationCouplingStatus" ADD VALUE 'RECOVERABLE';

-- AlterEnum
ALTER TYPE "DictationStatus" ADD VALUE 'INTERRUPTED';

-- DropIndex
DROP INDEX "Dictation_messageId_idx";

-- AlterTable
ALTER TABLE "Dictation" ADD COLUMN     "recoveryExpiresAt" TIMESTAMP(3),
ADD COLUMN     "terminationReason" "DictationTerminationReason" NOT NULL DEFAULT 'NONE';

-- CreateIndex
CREATE INDEX "Dictation_messageId_ordinal_idx" ON "Dictation"("messageId", "ordinal");
