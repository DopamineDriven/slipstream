-- AlterTable
ALTER TABLE "public"."Attachment" ALTER COLUMN "meta" DROP NOT NULL,
ALTER COLUMN "meta" DROP DEFAULT;
