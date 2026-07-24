import fs from 'fs';
let content = fs.readFileSync('js/app.js', 'utf8');

const sqlSettings = `-- 10. APP_SETTINGS (Beállítások)
CREATE TABLE IF NOT EXISTS app_settings (
    id TEXT PRIMARY KEY,
    settings_json JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Mindenki elérheti" ON app_settings;
CREATE POLICY "Mindenki elérheti" ON app_settings FOR ALL USING (true) WITH CHECK (true);
`;

content = content.replace('CREATE POLICY "Mindenki elérheti" ON works FOR ALL USING (true) WITH CHECK (true);\n`;', 'CREATE POLICY "Mindenki elérheti" ON works FOR ALL USING (true) WITH CHECK (true);\n\n' + sqlSettings + '`;');

fs.writeFileSync('js/app.js', content);
