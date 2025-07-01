-- AlterTable
ALTER TABLE "Conversation" ALTER COLUMN "userKeyId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Profile" ADD COLUMN     "lat" DOUBLE PRECISION,
ADD COLUMN     "lng" DOUBLE PRECISION,
ADD COLUMN     "timezone" TEXT;
