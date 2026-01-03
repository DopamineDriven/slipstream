-- AlterTable
ALTER TABLE "AttachmentProvider" ALTER COLUMN "indexedStoreRefs" DROP NOT NULL,
ALTER COLUMN "indexedStoreRefs" SET DATA TYPE TEXT;
