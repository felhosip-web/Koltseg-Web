# Queue rendszer és IndexedDB réteg Teljes Auditja (Deep Audit 2)

Ez a dokumentum a Költség Nyilvántartó alkalmazás (v5.3.0+) szinkronizációs sorának (Queue) és a helyi IndexedDB adatbázis rétegének részletes vizsgálatát és az elvégzett javításokat tartalmazza.

## 1. Queue (Szinkronizációs Sor) Rendszer Elemzése

A `SyncService` felel a helyi (offline) változtatások sorba állításáért és felhőbe történő szinkronizálásáért.

**A folyamat:**
1. Egy UI művelet (pl. törlés, módosítás) a managereken keresztül meghívja a `syncService.push()` vagy `syncService.addToQueue()` metódust.
2. A művelet bekerül a `_syncQueue` tömbbe a memóriában, és azonnal perzisztálásra kerül a böngésző `localStorage`-ába (`hmi_syncQueue` kulccsal).
3. Amikor az alkalmazás online állapotban van, a `processQueue()` metódus szekvenciálisan feldolgozza a sort.
4. Ha egy elem feldolgozása közben a felhő művelet sikertelen (de a hiba nem végzetes), a rendszer 3-szor újrapróbálja, majd `failed` státuszba teszi.

**Talált hibák és javítások:**
- **Beragadó `processing` állapot (Bug):** Amikor a `processQueue()` feldolgoz egy elemet, annak státusza ideiglenesen `processing` lesz. Ha az alkalmazás (vagy a böngésző) ezen a ponton váratlanul frissül vagy bezárul, az elem státusza `processing` marad a `localStorage`-ban. Az applikáció következő betöltésekor a `processQueue()` csak a `pending` és `failed` elemeket veszi figyelembe, így a `processing` állapotú elem örökre beragadt és sosem került szinkronizálásra.
  - *Javítás:* A `_loadSyncQueue()` inicializációs metódusba bekerült egy ellenőrzés. Ha betöltéskor `processing` státuszú elemet talál, azt azonnal visszaállítja `pending` státuszra, és frissíti a `localStorage`-ot. Így megszakadt szinkronizáció után az elemek újra sorra kerülnek.

## 2. IndexedDB / SQL Réteg Elemzése

Az alkalmazás adatbázisa a `Database` (oop-core.js) osztályon keresztül kommunikál a böngésző IndexedDB API-jával.

**A folyamat:**
- Az adatok külön "store"-okban (táblákban) tárolódnak (`items`, `months`, `entries`, `reminders`, stb.).
- A rendszer v11 óta teljes mértékben UUID-ket használ elsődleges kulcsként.
- A `Database` osztály tranzakciókat nyit az egyes műveletekhez.

**Talált hibák és javítások:**
- **Tranzakciókezelés hiánya kaszkádolt törléseknél (Árva rekordok):** Amikor a felhasználó egy kategóriát (`items` tábla) törölt, a rendszer csak a kategóriát törölte ki a helyi adatbázisból, a hozzá tartozó tranzakciókat (`entries` tábla) nem. Ezek "árva" (orphan) bejegyzésekként a rendszerben maradtak (ezt a `db-audit.js` is jelezte).
  - *Javítás:* A `Database` osztály kiegészült egy új `deleteItemWithEntries(itemId)` metódussal, amely egy *egyetlen* `readwrite` tranzakcióban törli a kategóriát és az összes hozzá tartozó bejegyzést. Az `ItemManager.delete()` metódus át lett írva, hogy ezt használja. Ez biztosítja az adatbázis integritását (nem maradnak orphan rekordok, és a művelet nem maradhat félbe).

- **UUID parsing hiba (`IncomingManager`):** A memóriában lévő adatok UUID string-ek. Az `IncomingManager` törlő metódusában (`delete(id)`) benne maradt egy régi, legacy `parseInt(id)` hívás, amely a string UUID-ket érvénytelen számmá alakította, ha számként is értelmezhetők lettek volna, kockáztatva az adatvesztést vagy hibás működést.
  - *Javítás:* A `parseInt` logika teljesen eltávolításra került a törlési metódusból. A rendszer string UUID-ként kezeli az azonosítókat.

- **Hibakezelés és Queue tisztítás hiányosságai:**
  - *Javítás:* A core domain managerek (`ItemManager`, `EntryManager`, `MonthManager`, `ReminderManager`, `IncomingManager`) összes `delete` metódusa megkapta a kötelező `try/catch` blokkot. Ha a helyi IndexedDB törlési művelet meghiúsul (pl. adatbázis korrupció miatt), a catch blokkban a rendszer logolja a hibát, és a `this.syncService.clearQueue()` meghívásával üríti a szinkronizációs sort. Ez megakadályozza, hogy az UI végtelenül várakozzon, vagy inkonzisztens állapotba kerüljön a frontend és a backend sor.

## Összegzés
A `SyncService` memóriabeli inicializálása mostantól védve van a "beragadó" sor-elemektől. Az adatbázis kaszkádolt törlései tranzakcionálisan, egy lépésben történnek az IndexedDB-ben, így jelentősen csökkentve az árva adatok és inkonzisztenciák esélyét. Minden kritikus adatbázis művelet megfelelő hiba-elfogást (try/catch) és sor-ürítő fallback logikát kapott.
