-- AlterTable
ALTER TABLE "Order" ADD COLUMN "inventoryAppliedAt" DATETIME;
ALTER TABLE "Order" ADD COLUMN "inventoryRevertedAt" DATETIME;

-- AlterTable
ALTER TABLE "Plant" ADD COLUMN "deletedAt" DATETIME;
ALTER TABLE "Plant" ADD COLUMN "deletedReason" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN "disabledAt" DATETIME;
ALTER TABLE "User" ADD COLUMN "disabledReason" TEXT;

-- CreateIndex
CREATE INDEX "Order_inventoryAppliedAt_idx" ON "Order"("inventoryAppliedAt");

-- CreateIndex
CREATE INDEX "Order_inventoryRevertedAt_idx" ON "Order"("inventoryRevertedAt");

-- CreateIndex
CREATE INDEX "Plant_deletedAt_idx" ON "Plant"("deletedAt");

-- CreateIndex
CREATE INDEX "User_disabledAt_idx" ON "User"("disabledAt");
