/*
  Warnings:

  - You are about to drop the column `citations` on the `Message` table. All the data in the column will be lost.
  - You are about to drop the column `citationsText` on the `Message` table. All the data in the column will be lost.
  - You are about to drop the column `thinkingText` on the `Message` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."Message" DROP COLUMN "citations",
DROP COLUMN "citationsText",
DROP COLUMN "thinkingText";
