# Supabase SQL Schema Generátor - Audit és Javítás (SCHEMA-GENERATOR-AUDIT.md)

## Hol található a generátor?
Az SQL séma generátor a `js/app.js` fájlban, a `getSupabaseSQLScript()` nevű globális függvényben található (körülbelül a 2047. sor környékén).

## Hogyan működik?
A generátor egy statikus, több soros stringként (template literal) adja vissza a teljes Supabase SQL sémát, amelyet a felhasználó a UI-on keresztül (az 5-ször kattintós fejlesztői diagnosztika panelen) ki tud másolni a vágólapra, hogy aztán bemásolja és lefuttassa a Supabase SQL Editorjában. Létrehozza a szükséges táblákat (`items`, `months`, `entries`, `templates`, `reminders`, `incomings`, `incoming_senders`, `deleted_records`, `works`, `app_settings`, `plugin_fuel_logs`), valamint az RLS (Row Level Security) irányelveket, amelyek anonim kulccsal való működés esetén lehetővé teszik a hozzáférést (BYOK modell).

## Milyen hibát találtam benne?
1. **Adattípus eltérés az ID mezőknél:** Számos tábla esetében (pl. `items`, `entries`, `templates`, `reminders`, `incomings`, `incoming_senders`, `deleted_records`, `works`) az `id` elsődleges kulcs mező típusa `UUID PRIMARY KEY DEFAULT gen_random_uuid()` volt. Bár ez backend szemszögből logikus, a mi frontend alkalmazásunk (v11 óta) mindenhol egyszerű string formátumú UUID-ket generál kliens oldalon, és azt küldi a felhőbe. Egy korábbi Deep Audit javítás (SUPABASE-AUDIT.md) a tényleges SQL migrációs fájlban (`supabase/migrations/20260712222340_init_schema.sql`) ezt a típust már lecserélte `TEXT`-re, viszont az itt lévő UI alapú generátor ezt nem követte le, így a felhasználóknak másolt SQL hibás (`UUID` / `BIGINT` helyett `TEXT` kéne) volt.
2. **Hiányzó kaszkád törlés (Cascade Delete):** A kategóriák (`items`) törlésekor a hozzá tartozó tételek (`entries`) felhőből való törlése orphan (árva) rekordokat eredményezhetett hálózati szakadás esetén. Emiatt az SQL sémában szükség volt egy triggerre (kaszkád törlés) a Supabase oldalon. A `supabase/migrations/20260712222340_init_schema.sql` ezt már tartalmazta, de a `js/app.js`-ben található generátor még nem adta hozzá.

## Mit javítottam?
- A `getSupabaseSQLScript()` függvényben minden érintett táblánál az `id UUID PRIMARY KEY DEFAULT gen_random_uuid()` sort lecseréltem `id TEXT PRIMARY KEY` sorra.
- A szkript végére hozzáadtam a hiányzó SQL triggert, ami kaszkád törlést végez az `entries` táblában, ha egy kategóriát (`items`) törölnek (a `cellKey` mintázat alapján).

## Példa a generált SQL-re (Kategóriák és Trigger)
```sql
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

-- ... (többi tábla) ...

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
```
