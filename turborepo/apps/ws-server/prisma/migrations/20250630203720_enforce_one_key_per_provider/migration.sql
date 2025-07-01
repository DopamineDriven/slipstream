/*
  Warnings:

  - A unique constraint covering the columns `[userId,provider]` on the table `UserApiKey` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "UserApiKey_userId_provider_idx";

-- CreateIndex
CREATE UNIQUE INDEX "UserApiKey_userId_provider_key" ON "UserApiKey"("userId", "provider");
