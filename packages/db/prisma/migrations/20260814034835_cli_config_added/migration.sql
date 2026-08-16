-- CreateEnum
CREATE TYPE "CliConfigSchemaVersion" AS ENUM ('v1_0');

-- CreateTable
CREATE TABLE "CliConfig" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "defaultProvider" "Provider" NOT NULL DEFAULT 'ANTHROPIC',
    "defaultModel" TEXT NOT NULL DEFAULT 'claude-fable-5',
    "showThinking" BOOLEAN NOT NULL DEFAULT true,
    "schemaVersion" "CliConfigSchemaVersion" NOT NULL DEFAULT 'v1_0',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CliConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CliConfig_userId_key" ON "CliConfig"("userId");

-- AddForeignKey
ALTER TABLE "CliConfig" ADD CONSTRAINT "CliConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
