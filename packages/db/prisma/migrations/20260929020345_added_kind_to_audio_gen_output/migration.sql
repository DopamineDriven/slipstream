-- CreateEnum
CREATE TYPE "AudioGenOutputKind" AS ENUM ('PARTIAL', 'FINAL');

-- AlterTable
ALTER TABLE "AudioGenOutput" ADD COLUMN     "kind" "AudioGenOutputKind" NOT NULL DEFAULT 'FINAL';
