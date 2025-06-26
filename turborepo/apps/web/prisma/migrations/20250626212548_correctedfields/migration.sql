/*
  Warnings:

  - Added the required column `userKeyId` to the `Conversation` table without a default value. This is not possible if the table is not empty.
  - Added the required column `apiKey` to the `Message` table without a default value. This is not possible if the table is not empty.
  - Added the required column `provider` to the `Message` table without a default value. This is not possible if the table is not empty.
  - Changed the type of `provider` on the `UserKey` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "userKeyId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "apiKey" TEXT NOT NULL,
ADD COLUMN     "model" TEXT,
ADD COLUMN     "provider" "Provider" NOT NULL;

-- AlterTable
ALTER TABLE "UserKey" DROP COLUMN "provider",
ADD COLUMN     "provider" "Provider" NOT NULL;
