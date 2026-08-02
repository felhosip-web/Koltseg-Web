# Költség Nyilvántartó

Modern, offline-first PWA költségnyilvántartó alkalmazás kategóriák és hónapok szerinti mátrixos felülettel.

![Verzió](https://img.shields.io/badge/verzió-4.0.0-blue)
![PWA](https://img.shields.io/badge/PWA-támogatott-4f46e5)
![Offline](https://img.shields.io/badge/Offline-teljesen_működő-10b981)

## ✨ Főbb Funkciók

- **Mátrixos felület** – Kategóriák × Hónapok
- **Multi-tranzakció** egy cellában (több tétel ugyanabban a kategória-hónap metszetben)
- **Teljes offline működés** + automatikus szinkronizáció
- **Felhő szinkronizáció** Supabase-szel (kétirányú)
- **Részletes riportok**: Excel, PDF, JSON export/import
- **Automatikus és manuális backup** rendszer
- **Határidők és ismétlődő események** kezelése
- **Kimutatások és grafikonok** (Chart.js)
- **Teljesen reszponzív** design (mobil + desktop)
- **PWA** – telepíthető alkalmazásként

## 🚀 Használat

1. Töltsd le a projektet vagy nyisd meg közvetlenül a böngészőben
2. **Telepítés**: Kattints a "Telepítés" gombra (PWA)
3. Adj hozzá kategóriákat és nyiss meg hónapokat
4. Kattints a cellákra a kiadások rögzítéséhez (több tétel is lehet egy cellában)

### Felhő szinkronizáció beállítása (opcionális)

1. Nyisd meg a ⚙️ **Beállítások** panelt
2. Add meg a Supabase URL-t és az Anon Public API Key-t
3. Kapcsold be a "Felhő használata" opciót
4. Mentés után a szinkronizáció automatikusan működni fog

## 🛠 Technológiai Stack

- **Frontend**: HTML5, Tailwind CSS, Vanilla JavaScript (OOP)
- **Adatbázis**: IndexedDB (local) + Supabase (cloud)
- **PWA**: Service Worker + Web Manifest
- **Grafikonok**: Chart.js
- **Export**: SheetJS (Excel), jsPDF (PDF)
- **Dátumkezelés**: dayjs
- **Verziókezelés**: automatikus build script

## 📁 Projekt Szerkezet
/
├── index.html
├── manifest.json
├── service-worker.js
├── version.json
├── css/
│   └── style.css
├── js/
│   ├── app.js
│   ├── oop-core.js
│   ├── ui-.js
│   ├── sync-.js
│   └── ...
├── icons/
├── scripts/
│   └── build.js
└── README.md