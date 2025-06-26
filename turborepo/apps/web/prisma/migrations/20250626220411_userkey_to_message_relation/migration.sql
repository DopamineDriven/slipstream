-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "userKeyId" TEXT;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_userKeyId_fkey" FOREIGN KEY ("userKeyId") REFERENCES "UserKey"("id") ON DELETE SET NULL ON UPDATE CASCADE;
