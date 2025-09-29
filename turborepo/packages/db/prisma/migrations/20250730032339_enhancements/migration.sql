-- AlterTable
ALTER TABLE "public"."ConversationSettings" ADD COLUMN     "enableAssetGen" BOOLEAN DEFAULT false,
ADD COLUMN     "enableThinking" BOOLEAN DEFAULT false,
ADD COLUMN     "enableWebSearch" BOOLEAN DEFAULT false,
ADD COLUMN     "maxTokens" INTEGER,
ADD COLUMN     "trackUsage" BOOLEAN DEFAULT false,
ADD COLUMN     "usageAlerts" BOOLEAN DEFAULT true;

-- AlterTable
ALTER TABLE "public"."Message" ADD COLUMN     "citations" JSONB,
ADD COLUMN     "citationsText" TEXT,
ADD COLUMN     "disliked" BOOLEAN DEFAULT false,
ADD COLUMN     "liked" BOOLEAN DEFAULT false,
ADD COLUMN     "thinkingText" TEXT,
ADD COLUMN     "tryAgain" BOOLEAN DEFAULT false;

-- AlterTable
ALTER TABLE "public"."Profile" ADD COLUMN     "postalCode" TEXT,
ADD COLUMN     "region" TEXT;
