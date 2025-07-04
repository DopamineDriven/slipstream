-- AlterEnum
ALTER TYPE "Provider" ADD VALUE 'ANTHROPIC';

-- AlterTable
ALTER TABLE "UserApiKey" ADD COLUMN     "isDefault" BOOLEAN NOT NULL DEFAULT false;
