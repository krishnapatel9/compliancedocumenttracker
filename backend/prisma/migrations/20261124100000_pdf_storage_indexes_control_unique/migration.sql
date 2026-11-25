-- PDFs are stored in Postgres (hosts with ephemeral disks lose local files).
CREATE TABLE "document_files" (
    "document_id" UUID NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL DEFAULT 'application/pdf',
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_files_pkey" PRIMARY KEY ("document_id")
);

ALTER TABLE "document_files" ADD CONSTRAINT "document_files_document_id_fkey"
    FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The files behind these paths no longer exist on ephemeral hosts; documents without a
-- document_files row are shown as "file missing, re-upload".
ALTER TABLE "documents" DROP COLUMN "file_path";

CREATE INDEX "documents_expiry_date_idx" ON "documents"("expiry_date");
CREATE INDEX "documents_category_idx" ON "documents"("category");
CREATE INDEX "documents_created_at_idx" ON "documents"("created_at");

-- Keep the newest link per (framework, control_code) before adding the unique index.
DELETE FROM "framework_controls" fc
USING "framework_controls" newer
WHERE fc."framework" = newer."framework"
  AND fc."control_code" = newer."control_code"
  AND (
        COALESCE(fc."linked_at", 'epoch'::timestamp) < COALESCE(newer."linked_at", 'epoch'::timestamp)
     OR (COALESCE(fc."linked_at", 'epoch'::timestamp) = COALESCE(newer."linked_at", 'epoch'::timestamp) AND fc."id" < newer."id")
  );

CREATE UNIQUE INDEX "framework_controls_framework_control_code_key"
    ON "framework_controls"("framework", "control_code");
