-- 2026-10-18: Checkers and Shoprite stored a card price of 0 for deals
-- without a fixed price, which showed shoppers "R0.00 card price" and pulled
-- list totals down. New prices pass through cardPrice() (packages/types);
-- this clears the ones already saved. A card price is only real when it is
-- above 0 and below the regular price. Data only: no table changes.
UPDATE "price_cache" SET "loyaltyPrice" = NULL
  WHERE "loyaltyPrice" IS NOT NULL AND ("loyaltyPrice" <= 0 OR "loyaltyPrice" >= "regularPrice");

UPDATE "list_items" SET "loyaltyPrice" = NULL
  WHERE "loyaltyPrice" IS NOT NULL AND ("loyaltyPrice" <= 0 OR "loyaltyPrice" >= "regularPrice");
