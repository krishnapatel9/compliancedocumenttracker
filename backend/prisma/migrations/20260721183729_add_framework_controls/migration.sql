-- CreateTable
CREATE TABLE "framework_controls" (
    "id" UUID NOT NULL,
    "framework" TEXT NOT NULL,
    "control_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "document_id" UUID,
    "linked_at" TIMESTAMP(3),

    CONSTRAINT "framework_controls_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "framework_controls" ADD CONSTRAINT "framework_controls_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
