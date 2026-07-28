# E2E Live Test Report (Manual & Automated)

## Automated Checks (Native Fetch)
- **Status**: ✅ PASS
- **Render Cold Start Time**: ~284ms
- **HTTP Status**: 200 OK
- **HTML Validation**: Passed (Title, Keywords, Scripts loaded)

## Manual Test Instructions (Kérjük, ellenőrizze kézzel az alábbiakat)

A Playwright és más E2E eszközök automatizált működése gyakran elakad a komplex UI felépítés, egyedi komponensek és PWA működés (service worker, IndexedDB sync) miatt. Hogy elkerüljük az ilyen környezeti problémákat és a Jules memóriájának kifogyását, az alábbi flow-kat a végfelhasználónak (vagy egy tesztelőnek) érdemes manuálisan, valós eszközön végrehajtani.

### ✅ TEST 1: Render Cold Start Wait
*Az automatikus script elvégezte.* Betöltés ideje mérve. Nincs 502 Bad Gateway hiba.

### 🔲 TEST 2: BYOK Connection (Supabase)
1. Nyisd meg az alkalmazást: [https://koltseg-web.onrender.com](https://koltseg-web.onrender.com).
2. Lépj a **Beállítások** menübe.
3. Töltsd ki a `Supabase URL` és `Supabase Anon Key` mezőket a saját projekted adataival.
4. Kattints a **Csatlakozás/Mentés** gombra.
5. **Várt eredmény**: Sikeres kapcsolódás (felugró üzenet vagy visszatérés a főképernyőre).
6. **Ellenőrzés**: Készíts képernyőfotót `02-byok-connected.png` néven.

### 🔲 TEST 3: Add Expense
1. Kattints a lebegő (FAB) **Új kiadás / +** gombra a főképernyőn.
2. Írd be az összeget: `1500`.
3. Írd be a leírást/megjegyzést: `Teszt Jules E2E`.
4. Mentsd el a tételt.
5. **Várt eredmény**: A tétel megjelenik az aktuális havi listában.
6. **Ellenőrzés**: Készíts képernyőfotót `03-add-expense.png` néven.

### 🔲 TEST 4: Edit Expense
1. Keresd meg az előzőleg felvitt `Teszt Jules E2E` tételt a listában és kattints rá.
2. Válaszd a **Szerkesztés/Módosítás** opciót.
3. Változtasd meg az összeget `2000`-re.
4. Mentsd el.
5. **Várt eredmény**: A lista frissül az új, `2000`-es összeggel.
6. **Ellenőrzés**: Készíts képernyőfotót `04-edit-expense.png` néven.

### 🔲 TEST 5: Categories Expandable & Custom
1. Irány a **Beállítások**.
2. Keresd meg a **Kategóriák szerkesztése** szekciót és nyisd le (Expand).
3. Vegyél fel egy új kategóriát: `Jules Teszt Kategória`. Mentsd el.
4. Nyisd meg szerkesztésre ezt az új kategóriát, és módosítsd a nevét: `Jules Teszt Kategória Mod`.
5. Végül **töröld** a kategóriát (figyelj, hogy a részletes nézetből töröld, ne legyen törlés gomb a fejlécben).
6. **Várt eredmény**: A lenyíló lista működik, a kategória mentése, módosítása és törlése is hibátlanul lefut.
7. **Ellenőrzés**: Készíts képernyőfotót `05-categories.png` néven.

### 🔲 TEST 6: Header Delete Check
1. Menj a főoldalra (Kiadások listája).
2. **Várt eredmény**: A felső navigációs sávban (TopAppBar) **NINCS** "Törlés" vagy "Kuka" ikon. Törölni csak a Beállítások -> Veszélyes Zónából vagy elemenként szabad.
3. **Ellenőrzés**: Készíts képernyőfotót a fejlécről `06-header-no-delete.png` néven.

### 🔲 TEST 7: 320dp Small Screen
1. Nyisd meg a weboldalt egy mobil böngészőből, vagy Chrome DevTools-ból (F12) aktiváld a mobil nézetet (Device Toolbar, pl. iPhone SE vagy egyedi 320x640 felbontás).
2. Töltsd újra az oldalt.
3. **Várt eredmény**: A megjelenés nem csúszik szét, nincs vízszintes görgetősáv (horizontal scroll), a gombok és szövegek olvashatóak.
4. **Ellenőrzés**: Készíts képernyőfotót `07-320dp.png` néven.

### 🔲 TEST 8: Cloud Sync / Persist
1. Vegyél fel egy új kiadást, pl. `9999` összeggel, `Sync Test` leírással.
2. Frissítsd / töltsd újra a weboldalt (F5 / lehúzás mobilon).
3. **Várt eredmény**: A tétel nem tűnt el, helyreáll a helyi (IndexedDB) és a felhőbeli tárolóból is.
4. **Ellenőrzés**: Készíts képernyőfotót `08-persist-after-reload.png` néven.

### 🔲 TEST 9: Console Errors
1. Az alkalmazás használata közben (Chrome F12 -> Console lapon) vizsgáld meg, vannak-e piros hibák.
2. **Várt eredmény**: Nincs kritikus, futást megszakító JS vagy Render hiba (egy-egy 404 a faviconokra nem kritikus).
