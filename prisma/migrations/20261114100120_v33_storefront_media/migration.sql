-- AlterTable
ALTER TABLE "brands" ADD COLUMN     "imageKey" VARCHAR(255);

-- AlterTable
ALTER TABLE "categories" ADD COLUMN     "imageKey" VARCHAR(255);

-- AlterTable
ALTER TABLE "cms_banners" ADD COLUMN     "descriptionAr" VARCHAR(400),
ADD COLUMN     "descriptionEn" VARCHAR(400),
ADD COLUMN     "linkLabelAr" VARCHAR(120),
ADD COLUMN     "linkLabelEn" VARCHAR(120);

-- AlterTable
ALTER TABLE "product_skus" ADD COLUMN     "featured" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "featuredOrder" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "product_skus_featured_featuredOrder_idx" ON "product_skus"("featured", "featuredOrder");
