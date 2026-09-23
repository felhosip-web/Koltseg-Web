# Költség-Web (Költség Nyilvántartó)

Modern, hibrid architektúrájú (React + Vanilla JS) PWA költségnyilvántartó alkalmazás offline-first működéssel, mátrixos adatszerkezettel és kétirányú Supabase szinkronizációval.

![Verzió](https://img.shields.io/badge/verzió-7.0.23-blue)
![PWA](https://img.shields.io/badge/PWA-támogatott-4f46e5)
![Offline](https://img.shields.io/badge/Offline-teljesen_működő-10b981)

## ✨ Főbb funkciók

- **Mátrixos költségnézet** – Kategóriák és Hónapok szerinti rendszerezés
- **Multi-tranzakció cellánként** – Több tétel rögzítése ugyanabban a kategória-hónap metszetben
- **Offline-first működés** – Teljes funkcionalitás helyi IndexedDB alapokon
- **Kétirányú Supabase szinkron** – Okos diff-alapú szinkronizáció, háttérsor (queue) és részleges hiba (partial error) visszajelzések
- **Riportok és Export/Import** – Helyi és felhős adatmentés, Excel, PDF és JSON kimenetek
- **Határidők és emlékeztetők** – Fizetési határidők vizuális követése
- **Kimutatások és grafikonok** – Beépített statisztikai nézet
- **Munka nyilvántartás** – (Work Log) Külön modul a munkafolyamatok, feladatok, határidők és állapotok követésére
- **Opcionális Plugin Modulok** – Gyors Jegyzetek, EUR/HUF Kalkulátor, Pénzügyi Számológép, Üzemanyag & Útiköltség Kalkulátor, Tankolás Nyilvántartó, Bevásárlólista
- **PWA (Progressive Web App)** – Telepíthető asztali és mobil eszközökre
- **Sötét mód** – Teljes vizuális támogatás szemkímélő palettákkal
- **Biztonsági mentés (Backup)** – Helyi biztonsági mentések és opcionális Google Drive integráció (ha aktív)

## 📸 Képernyőképek

*(TODO: Screenshots hozzáadása a felületről, a hibrid nézetekről és a modulokról)*

## 🚀 Gyors kezdés

### Előfeltételek
- Node.js (LTS javasolt)
- Git

### Telepítés és Futtatás

1. **Klónozás:**
   ```bash
   git clone https://github.com/[felhasznalo]/Koltseg-Web.git
   cd Koltseg-Web
   ```

2. **Függőségek telepítése:**
   ```bash
   npm install
   ```

3. **Fejlesztői szerver indítása (Dev mode):**
   ```bash
   npm run dev
   ```
   Az alkalmazás elérhető lesz a megadott (pl. `http://localhost:3000`) címen.

4. **Production Build és Start:**
   A rendszer Vite-ot használ a frontend, és esbuildet a backend buildeléséhez.
   ```bash
   npm run build
   npm start
   ```
   *Megjegyzés: A Vite `base` beállítása produkciós buildnél `/Koltseg-Web/`, hogy a GitHub Pages szerű alkönyvtárakból is megfelelően működjön.*

## ☁️ Felhő szinkron (Supabase) – BYOK (Bring Your Own Key)

Az alkalmazás képes egy saját tulajdonú Supabase projekttel szinkronizálni az adatokat (BYOK - Hozd a saját kulcsod).

1. Hozz létre egy saját projektet a [Supabase](https://supabase.com/)-en.
2. A beépített alkalmazás **Beállítások** paneljén nyisd meg a Supabase beállításokat.
3. Másold be az egyedi **Supabase URL**-t és az **Anon Public API Key**-t.
4. Futtasd le a rendszer által generált (vagy a `supabase/migrations/` mappában található) SQL sémát a Supabase SQL Editorjában.
5. Kapcsold be a **"Felhő használata"** opciót.
6. A rendszer okos-szinkronizálást végez: összehasonlítja a helyi és a távoli adatokat, és részleges hálózati hibák esetén is jelzést ad (toast/warning formájában), miközben az offline várakozási sort fenntartja.

## 🛠 Technológiai stack

Az alkalmazás egy modern, hibrid architekturát használ, ahol a domain logika és egyes funkciók vanilla OOP JavaScriptben, míg a UI komponensek fokozatosan React alapokra lettek migrálva.

- **Frontend Framework:** React 19, Vite (bundler), Tailwind CSS v3
- **Állapotkezelés:** Zustand (a React/Vanilla bridge-hez)
- **Domain Logika & Alap UI:** Vanilla JavaScript (ES Modules, OOP alapok)
- **Helyi Adatbázis:** IndexedDB (Vanilla core és `dexie` is támogatott)
- **Felhő szinkron:** Supabase JS
- **Backend (Opcionális/Lokális):** Node.js, Express (server.ts), esbuild
- **Egyéb eszközök:** Chart.js, dayjs, web-push (értesítések)

## 📁 Projektstruktúra

A fontosabb mappák és fájlok elrendezése:

```text
/
├── src/                # React komponensek (UI shell, tabok, modulok)
├── js/                 # Vanilla JS domain logika, IndexedDB, Supabase sync réteg
├── css/                # Tailwind direktívák és egyedi CSS (style.css)
├── public/             # PWA manifest, statikus tartalmak
├── supabase/           # Supabase migrációs fájlok és SQL generátorok
├── scripts/            # Build szkriptek, teszt futtatók
├── tests/              # E2E és egységtesztek
├── server.ts           # Express alapú helyi dev/prod szerver
├── index.html          # Belépési pont
├── version.json        # Alkalmazás verziója és változásnapló
├── package.json        # NPM függőségek és scriptek
└── modules-manifest.json # Opcionális plugin modulok definíciói
```

## 🧪 Fejlesztés és Tesztek

A projekt beépített tesztekkel rendelkezik, melyek az npm szkriptekből hívhatók:
- **Tesztek futtatása:** `npm run test` (tsx alapú tesztek a `tests/` mappából)
- **Linter / Típusellenőrzés:** `npm run lint` (TypeScript ellenőrzés)

## 📜 Verziókezelés

A projekt verziókezelése a `version.json` fájl alapján működik. Az aktuális verzió és a teljes változásnapló a `version.json`-ben található.

## 📄 Licenc

Nyílt forráskódú projekt. Kérjük, tekintse meg a repository-t az esetleges részletes licencinformációkért.

## 🤝 Megjegyzés közreműködőknek

Köszönjük az érdeklődést a Költség-Web projekt iránt! A fejlesztés fókuszában jelenleg a fokozatos React migráció (hibrid üzemmód) és a teljes offline-first (IndexedDB) stabilitás áll Supabase szinkronizáció mellett. Minden pull requestet és hibajegyet szívesen fogadunk! Kérjük, hogy beküldés előtt mindig futtasd a teszteket és a `npm run build` parancsot a módosítások teszteléséhez.
