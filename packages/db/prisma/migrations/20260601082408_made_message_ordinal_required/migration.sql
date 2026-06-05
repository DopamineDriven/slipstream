/*
  Warnings:

  - A unique constraint covering the columns `[conversationId,ordinal]` on the table `Message` will be added. If there are existing duplicate values, this will fail.
  - Made the column `ordinal` on table `Message` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Message" ALTER COLUMN "ordinal" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Message_conversationId_ordinal_key" ON "Message"("conversationId", "ordinal");
