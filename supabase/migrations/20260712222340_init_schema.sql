-- Költségnyilvántartó v4.1 - Teljes Supabase SQL Táblaséma
-- Futtasd le ezt a szkriptet a Supabase SQL Editor-jában!

-- 1. ITEMS (Kategóriák)
CREATE TABLE IF NOT EXISTS items (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    color TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Mindenki elérheti" ON items;
CREATE POLICY "Mindenki elérheti" ON items FOR ALL USING (true) WITH CHECK (true);

-- 2. MONTHS (Aktív Hónapok)
CREATE TABLE IF NOT EXISTS months (
    month TEXT PRIMARY KEY,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE months ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Mindenki elérheti" ON months;
CREATE POLICY "Mindenki elérheti" ON months FOR ALL USING (true) WITH CHECK (true);

-- 3. ENTRIES (Bejegyzések / Rész-tételek)
CREATE TABLE IF NOT EXISTS entries (
    id TEXT PRIMARY KEY,
    "cellKey" TEXT NOT NULL,
    amount NUMERIC NOT NULL,
    currency TEXT DEFAULT 'HUF',
    "paymentMethod" TEXT DEFAULT 'Kártya',
    note TEXT,
    color TEXT,
    "isStorno" BOOLEAN DEFAULT FALSE,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Mindenki elérheti" ON entries;
CREATE POLICY "Mindenki elérheti" ON entries FOR ALL USING (true) WITH CHECK (true);

-- 4. TEMPLATES (Sablonok)
CREATE TABLE IF NOT EXISTS templates (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    amount NUMERIC,
    currency TEXT DEFAULT 'HUF',
    comment TEXT,
    category TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Mindenki elérheti" ON templates;
CREATE POLICY "Mindenki elérheti" ON templates FOR ALL USING (true) WITH CHECK (true);

-- 5. REMINDERS (Határidők)
CREATE TABLE IF NOT EXISTS reminders (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    amount NUMERIC NOT NULL,
    currency TEXT DEFAULT 'HUF',
    due_date TEXT NOT NULL,
    frequency TEXT DEFAULT 'once',
    completed BOOLEAN DEFAULT FALSE,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Mindenki elérheti" ON reminders;
CREATE POLICY "Mindenki elérheti" ON reminders FOR ALL USING (true) WITH CHECK (true);

-- 6. INCOMINGS (Bejövő utalások)
CREATE TABLE IF NOT EXISTS incomings (
    id TEXT PRIMARY KEY,
    sender TEXT NOT NULL,
    date TEXT NOT NULL,
    amount NUMERIC NOT NULL,
    comment TEXT,
    "isStorno" BOOLEAN DEFAULT FALSE,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE incomings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Mindenki elérheti" ON incomings;
CREATE POLICY "Mindenki elérheti" ON incomings FOR ALL USING (true) WITH CHECK (true);

-- 7. INCOMING_SENDERS (Bejövő küldők)
CREATE TABLE IF NOT EXISTS incoming_senders (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE incoming_senders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Mindenki elérheti" ON incoming_senders;
CREATE POLICY "Mindenki elérheti" ON incoming_senders FOR ALL USING (true) WITH CHECK (true);

-- 8. DELETED_RECORDS (Törölt rekordok követése - Tombstone)
CREATE TABLE IF NOT EXISTS deleted_records (
    id TEXT PRIMARY KEY,
    record_id TEXT NOT NULL,
    table_name TEXT NOT NULL,
    deleted_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE deleted_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Mindenki elérheti" ON deleted_records;
CREATE POLICY "Mindenki elérheti" ON deleted_records FOR ALL USING (true) WITH CHECK (true);

-- 9. WORKS (Munka nyilvántartás)
CREATE TABLE IF NOT EXISTS works (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    location TEXT,
    date TEXT NOT NULL,
    duration NUMERIC DEFAULT 1,
    status TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE works ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Mindenki elérheti" ON works;
CREATE POLICY "Mindenki elérheti" ON works FOR ALL USING (true) WITH CHECK (true);

-- 10. APP_SETTINGS (Beállítások)
CREATE TABLE IF NOT EXISTS app_settings (
    id TEXT PRIMARY KEY,
    settings_json JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Mindenki elérheti" ON app_settings;
CREATE POLICY "Mindenki elérheti" ON app_settings FOR ALL USING (true) WITH CHECK (true);

-- 11. PLUGIN_FUEL_LOGS (Tankolási napló modul)
CREATE TABLE IF NOT EXISTS plugin_fuel_logs (
    id TEXT PRIMARY KEY,
    odo NUMERIC NOT NULL,
    liters NUMERIC NOT NULL,
    price NUMERIC NOT NULL,
    totalCost NUMERIC NOT NULL,
    "paymentMethod" TEXT DEFAULT 'Kártya',
    station TEXT,
    note TEXT,
    date TEXT,
    timestamp BIGINT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE plugin_fuel_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Mindenki elérheti" ON plugin_fuel_logs;
CREATE POLICY "Mindenki elérheti" ON plugin_fuel_logs FOR ALL USING (true) WITH CHECK (true);

-- 12. CASCADE DELETE TRIGGER FOR ENTRIES
CREATE OR REPLACE FUNCTION delete_item_cascade()
RETURNS TRIGGER AS $$
BEGIN
    DELETE FROM entries WHERE "cellKey" LIKE OLD.id || '\_%' OR "cellKey" LIKE '%\_' || OLD.id;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_delete_item_cascade ON items;
CREATE TRIGGER trigger_delete_item_cascade
AFTER DELETE ON items
FOR EACH ROW
EXECUTE FUNCTION delete_item_cascade();
