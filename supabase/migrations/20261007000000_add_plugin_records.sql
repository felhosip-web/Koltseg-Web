-- 13. PLUGIN_RECORDS (Dinamikus Bővítmény Adatok)
CREATE TABLE IF NOT EXISTS plugin_records (
    id TEXT PRIMARY KEY,
    plugin_id TEXT NOT NULL,
    collection TEXT NOT NULL,
    record_key TEXT NOT NULL,
    data JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_plugin_records_plugin_id ON plugin_records(plugin_id);
CREATE INDEX IF NOT EXISTS idx_plugin_records_plugin_coll ON plugin_records(plugin_id, collection);
CREATE INDEX IF NOT EXISTS idx_plugin_records_plugin_coll_key ON plugin_records(plugin_id, collection, record_key);

ALTER TABLE plugin_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Mindenki elérheti" ON plugin_records;
CREATE POLICY "Mindenki elérheti" ON plugin_records FOR ALL USING (true) WITH CHECK (true);
