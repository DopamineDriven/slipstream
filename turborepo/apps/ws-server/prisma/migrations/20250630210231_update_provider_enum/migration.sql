/*
  Warnings:

  - The values [ANTHROPIC,X_AI,META] on the enum `Provider` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "Provider_new" AS ENUM ('OPENAI', 'GROK', 'GEMINI');
ALTER TABLE "UserApiKey" ALTER COLUMN "provider" TYPE "Provider_new" USING ("provider"::text::"Provider_new");
ALTER TABLE "Settings" ALTER COLUMN "defaultProvider" TYPE "Provider_new" USING ("defaultProvider"::text::"Provider_new");
ALTER TABLE "Message" ALTER COLUMN "provider" TYPE "Provider_new" USING ("provider"::text::"Provider_new");
ALTER TYPE "Provider" RENAME TO "Provider_old";
ALTER TYPE "Provider_new" RENAME TO "Provider";
DROP TYPE "Provider_old";
COMMIT;
