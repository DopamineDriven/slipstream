-- CreateEnum
CREATE TYPE "ColorModel" AS ENUM ('rgb', 'rgba', 'grayscale', 'grayscale_alpha', 'indexed', 'cmyk', 'ycbcr', 'ycck', 'vector', 'lab', 'unknown');

-- AlterTable
ALTER TABLE "DocumentMetadata" ADD COLUMN     "isLinearized" BOOLEAN;

-- AlterTable
ALTER TABLE "ImageMetadata" ADD COLUMN     "colorModel" "ColorModel";
