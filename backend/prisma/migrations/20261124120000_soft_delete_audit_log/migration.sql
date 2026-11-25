-- Soft delete
ALTER TABLE "documents" ADD COLUMN "deleted_at" TIMESTAMP(3);
CREATE INDEX "documents_deleted_at_idx" ON "documents"("deleted_at");

-- Audit trail
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor_id" UUID,
    "actor_email" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "document_title" TEXT,
    "details" JSONB,
    "ip" TEXT,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");
CREATE INDEX "audit_logs_entity_id_idx" ON "audit_logs"("entity_id");
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- Append-only: the application (and anyone using its credentials through a bug) cannot rewrite history.
CREATE FUNCTION audit_logs_append_only() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'audit_logs is append-only (% not allowed)', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_logs_no_update_delete
    BEFORE UPDATE OR DELETE ON "audit_logs"
    FOR EACH ROW EXECUTE FUNCTION audit_logs_append_only();

CREATE TRIGGER audit_logs_no_truncate
    BEFORE TRUNCATE ON "audit_logs"
    FOR EACH STATEMENT EXECUTE FUNCTION audit_logs_append_only();
