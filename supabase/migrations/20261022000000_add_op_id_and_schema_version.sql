-- Migration: Add schema_version and op_id to plugin_records for PLG3-P3-1 Durable Storage & Sync

ALTER TABLE plugin_records ADD COLUMN IF NOT EXISTS schema_version INT DEFAULT 1 NOT NULL;
ALTER TABLE plugin_records ADD COLUMN IF NOT EXISTS op_id UUID;

-- Index for schema_version queries
CREATE INDEX IF NOT EXISTS idx_plugin_records_schema_ver ON plugin_records(plugin_id, schema_version);

-- Unique partial index for server-side op_id idempotency per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_plugin_records_user_op_id ON plugin_records(user_id, op_id) WHERE op_id IS NOT NULL;
