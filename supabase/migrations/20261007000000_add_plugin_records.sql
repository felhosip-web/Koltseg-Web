-- 13. PLUGIN_RECORDS (Dinamikus Bővítmény Adatok)
CREATE TABLE IF NOT EXISTS plugin_records (
    id TEXT PRIMARY KEY,
    plugin_id TEXT NOT NULL,
    collection TEXT NOT NULL,
    record_key TEXT NOT NULL,
    data JSONB NOT NULL,
    user_id UUID DEFAULT auth.uid(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_plugin_records_plugin_id ON plugin_records(plugin_id);
CREATE INDEX IF NOT EXISTS idx_plugin_records_plugin_coll ON plugin_records(plugin_id, collection);
CREATE INDEX IF NOT EXISTS idx_plugin_records_plugin_coll_key ON plugin_records(plugin_id, collection, record_key);
CREATE INDEX IF NOT EXISTS idx_plugin_records_user_id ON plugin_records(user_id);

ALTER TABLE plugin_records ENABLE ROW LEVEL SECURITY;

-- Strict policy for authenticated users: User A cannot access or mutate User B records
DROP POLICY IF EXISTS "Users can only access their own plugin records" ON plugin_records;
CREATE POLICY "Users can only access their own plugin records"
ON plugin_records
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Fallback policy for unauthenticated/anon BYOK sessions (where user_id IS NULL)
DROP POLICY IF EXISTS "Anon fallback access for user_id IS NULL" ON plugin_records;
CREATE POLICY "Anon fallback access for user_id IS NULL"
ON plugin_records
FOR ALL
TO anon
USING (user_id IS NULL)
WITH CHECK (user_id IS NULL);
