-- Rules the application also enforces, repeated here so that no code path can bypass them.

ALTER TABLE "Review"    ADD CONSTRAINT "review_rating_range"    CHECK ("rating" BETWEEN 1 AND 5);
ALTER TABLE "CartItem"  ADD CONSTRAINT "cart_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "OrderItem" ADD CONSTRAINT "order_quantity_positive" CHECK ("quantity" > 0);

-- Money is stored in paise and can never be negative.
ALTER TABLE "Order"   ADD CONSTRAINT "order_totals_non_negative" CHECK (
  "subtotalPaise" >= 0 AND "discountPaise" >= 0 AND "shippingPaise" >= 0
  AND "codFeePaise" >= 0 AND "taxPaise" >= 0 AND "totalPaise" >= 0
);
ALTER TABLE "OrderItem" ADD CONSTRAINT "order_item_money_non_negative" CHECK (
  "unitPricePaise" >= 0 AND "taxPaise" >= 0 AND "lineTotalPaise" >= 0
);
ALTER TABLE "Product" ADD CONSTRAINT "product_price_non_negative" CHECK ("pricePaise" >= 0);
ALTER TABLE "Payment" ADD CONSTRAINT "payment_amount_positive"   CHECK ("amountPaise" > 0);
ALTER TABLE "Refund"  ADD CONSTRAINT "refund_amount_positive"    CHECK ("amountPaise" > 0);

-- Stock can go to zero but never below it, and reservations cannot exceed what is on hand.
ALTER TABLE "Inventory" ADD CONSTRAINT "inventory_non_negative" CHECK ("onHand" >= 0 AND "reserved" >= 0);
ALTER TABLE "Inventory" ADD CONSTRAINT "inventory_reserved_within_on_hand" CHECK ("reserved" <= "onHand");

-- An Inventory row belongs to exactly one of a product or a variant, never both or neither.
ALTER TABLE "Inventory" ADD CONSTRAINT "inventory_one_owner" CHECK (
  ("productId" IS NOT NULL AND "variantId" IS NULL)
  OR ("productId" IS NULL AND "variantId" IS NOT NULL)
);
