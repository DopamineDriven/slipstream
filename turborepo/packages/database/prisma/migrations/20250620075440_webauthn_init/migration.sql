/*
  Warnings:

  - You are about to drop the column `senderId` on the `Message` table. All the data in the column will be lost.
  - The `senderType` column on the `Message` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `location` on the `Profile` table. All the data in the column will be lost.
  - The `theme` column on the `Settings` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - Changed the type of `provider` on the `AiAgent` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Added the required column `updatedAt` to the `Session` table without a default value. This is not possible if the table is not empty.
  - Made the column `email` on table `User` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "SenderType" AS ENUM ('USER', 'AI', 'SYSTEM');

-- CreateEnum
CREATE TYPE "ThemePreference" AS ENUM ('LIGHT', 'DARK', 'SYSTEM');

-- CreateEnum
CREATE TYPE "Provider" AS ENUM ('OPENAI', 'ANTHROPIC', 'X_AI', 'GEMINI', 'META');

-- DropForeignKey
ALTER TABLE "Message" DROP CONSTRAINT "Message_aiAgentId_fkey";

-- AlterTable
ALTER TABLE "AiAgent" DROP COLUMN "provider",
ADD COLUMN     "provider" "Provider" NOT NULL;

-- AlterTable
ALTER TABLE "Message" DROP COLUMN "senderId",
ADD COLUMN     "userId" TEXT,
DROP COLUMN "senderType",
ADD COLUMN     "senderType" "SenderType" NOT NULL DEFAULT 'USER';

-- AlterTable
ALTER TABLE "Profile" DROP COLUMN "location",
ADD COLUMN     "city" TEXT,
ADD COLUMN     "country" TEXT;

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "Settings" DROP COLUMN "theme",
ADD COLUMN     "theme" "ThemePreference" DEFAULT 'SYSTEM';

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "email" SET NOT NULL;

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VerificationToken_pkey" PRIMARY KEY ("identifier","token")
);

-- CreateTable
CREATE TABLE "Authenticator" (
    "credentialID" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "credentialPublicKey" TEXT NOT NULL,
    "counter" INTEGER NOT NULL,
    "credentialDeviceType" TEXT NOT NULL,
    "credentialBackedUp" BOOLEAN NOT NULL,
    "transports" TEXT,

    CONSTRAINT "Authenticator_pkey" PRIMARY KEY ("userId","credentialID")
);

-- CreateIndex
CREATE UNIQUE INDEX "Authenticator_credentialID_key" ON "Authenticator"("credentialID");

-- AddForeignKey
ALTER TABLE "Authenticator" ADD CONSTRAINT "Authenticator_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
