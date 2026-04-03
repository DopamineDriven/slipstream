/*
  Warnings:

  - A unique constraint covering the columns `[attachmentId,provider,keyFingerprint]` on the table `AttachmentProvider` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `keyFingerprint` to the `AttachmentProvider` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."AttachmentProvider" ADD COLUMN     "keyFingerprint" VARCHAR(128) NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "AttachmentProvider_attachmentId_provider_keyFingerprint_key" ON "public"."AttachmentProvider"("attachmentId", "provider", "keyFingerprint");
