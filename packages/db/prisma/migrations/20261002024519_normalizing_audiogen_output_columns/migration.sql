-- AlterTable
ALTER TABLE "AudioGenOutput" ADD COLUMN     "content" TEXT,
ADD COLUMN     "facilitatingModel" TEXT,
ADD COLUMN     "generatingModel" TEXT,
ADD COLUMN     "provider" "Provider";
