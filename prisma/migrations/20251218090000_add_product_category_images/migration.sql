-- CreateEnum
CREATE TYPE "ProductCategory" AS ENUM ('PLANT', 'CHEMICAL', 'TOOL');

-- AlterTable
ALTER TABLE "Plant" ADD COLUMN "category" "ProductCategory" NOT NULL DEFAULT 'PLANT';
ALTER TABLE "Plant" ADD COLUMN "imageUrls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Make size optional (used mainly for plants)
ALTER TABLE "Plant" ALTER COLUMN "size" DROP NOT NULL;

-- Backfill existing rows to keep backwards compatibility
UPDATE "Plant"
SET "imageUrls" = ARRAY["imagePath"]
WHERE "imagePath" IS NOT NULL AND cardinality("imageUrls") = 0;

-- CreateIndex
CREATE INDEX "Plant_category_idx" ON "Plant"("category");

