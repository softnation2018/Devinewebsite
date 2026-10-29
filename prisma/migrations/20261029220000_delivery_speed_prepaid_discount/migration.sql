-- CreateEnum
CREATE TYPE "DeliverySpeed" AS ENUM ('STANDARD', 'EXPRESS');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "deliverySpeed" "DeliverySpeed" NOT NULL DEFAULT 'STANDARD',
ADD COLUMN     "prepaidDiscountPaise" INTEGER NOT NULL DEFAULT 0;

-- The owner's delivery and prepaid rules (2026-10-29). A shop that has not
-- been seeded yet gets these from the seed instead.
INSERT INTO "StoreSetting" ("key", "value", "needsOwnerDecision", "description", "updatedAt") VALUES
  ('delivery.expressEnabled', 'true', false, 'Offer Express delivery (2-3 days, pay online only)', now()),
  ('prepaid.expressDiscountPercent', '15', false, 'Discount for Express delivery paid online (%)', now()),
  ('prepaid.standardDiscountPercent', '10', false, 'Discount for Standard delivery paid online (%)', now())
ON CONFLICT ("key") DO NOTHING;
