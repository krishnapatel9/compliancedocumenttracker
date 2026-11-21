-- Key expiry warnings to the expiry date they were sent for, so a renewed
-- document (new expiry date) gets its 30 / 7 / 0-day warnings again.

-- 1. Add the column as nullable and back-fill it from each document's current expiry date
ALTER TABLE "notifications" ADD COLUMN "expiry_date" DATE;

UPDATE "notifications" AS n
SET "expiry_date" = d."expiry_date"
FROM "documents" AS d
WHERE d."id" = n."document_id";

ALTER TABLE "notifications" ALTER COLUMN "expiry_date" SET NOT NULL;

-- 2. Replace the old (document, threshold) key with (document, expiry date, threshold)
DROP INDEX "notifications_document_id_days_before_key";

CREATE UNIQUE INDEX "notifications_document_id_expiry_date_days_before_key"
ON "notifications"("document_id", "expiry_date", "days_before");
