/*
  Warnings:

  - Made the column `meta` on table `Attachment` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "public"."Attachment" ALTER COLUMN "meta" SET NOT NULL;
