// js/help-data.js - Részletes és bővíthető súgó adatforrás magyar nyelven

export const HELP_SECTIONS = [
    {
        id: "google_auth",
        title: "🔑 Google Bejelentkezés & Szinkronizáció",
        icon: "fab fa-google text-red-500",
        description: "Hogyan használhatod Google fiókodat a telefonodon és a gépeden az adatok automatikus szinkronizálására.",
        articles: [
            {
                title: "Hogyan működik a Google Szinkronizáció?",
                content: `A rendszer képes összekapcsolódni a Google fiókoddal a Supabase felhőszolgáltatáson keresztül. Ha bejelentkezel a Google fiókoddal, minden eszközöd (mobil, tablet, asztali számítógép) ugyanazt az adatbázist fogja elérni.<br><br>
                <strong>Előnyök:</strong>
                <ul class="list-disc pl-5 mt-2 space-y-1">
                    <li>Nincs szükség külön jelszó megjegyezésére.</li>
                    <li>Chrome böngészőből és Android/iOS mobilról is azonnal elérhető.</li>
                    <li>Az adatok valós időben szinkronizálódnak, ha online vagy.</li>
                    <li>Ha offline vagy, a telefonod helyben (IndexedDB) menti a tételeket, és amint internetet észlel, feltölti a felhőbe.</li>
                </ul>`
            },
            {
                title: "Google OAuth beállítása a Supabase-ben",
                content: `Ahhoz, hogy a Google bejelentkezés működjön, a saját Supabase projektedben be kell állítanod a Google OAuth szolgáltatót:<br><br>
                <ol class="list-decimal pl-5 space-y-2">
                    <li>Menj a <a href="https://console.cloud.google.com" target="_blank" class="text-indigo-600 underline">Google Cloud Console</a> oldalra és hozz létre egy OAuth klienst.</li>
                    <li>A Supabase irányítópultján válaszd ki a projektedet, majd lépj az <strong>Authentication / Providers / Google</strong> menüpontba.</li>
                    <li>Másold be a Google-től kapott <em>Client ID</em>-t és <em>Client Secret</em>-et a Supabase-be.</li>
                    <li>A Supabase által megadott <em>Redirect URI</em>-t (visszaesési cím) másold vissza a Google Cloud Console OAuth beállításaiba a 'Authorized redirect URIs' mezőbe.</li>
                    <li>Kapcsold be a Google engedélyezését a Supabase-ben, és mentsd el a változtatásokat.</li>
                </ol>`
            },
            {
                title: "Eszközök közötti átjárhatóság",
                content: `Ha bejelentkeztél Chrome-ban asztali gépen, és bejelentkezel a telefonodon is ugyanazzal a Google fiókkal, a szinkronizációs motor automatikusan összefésüli a helyi IndexedDB-ben lévő adatokat a felhővel. 
                <br><br>
                <em>Fontos:</em> Az intelligens kétirányú összefésülés (Smart Merge) biztosítja, hogy a legfrissebb bejegyzés maradjon meg, így véletlenül sem törlődik semmi.`
            }
        ]
    },
    {
        id: "supabase_setup",
        title: "☁️ Supabase Felhő Beállítások",
        icon: "fas fa-cloud text-indigo-500",
        description: "Saját felhő adatbázis beállítása, SQL séma és a biztonságos szinkronizáció folyamata.",
        articles: [
            {
                title: "Supabase projekt indítása és paraméterek",
                content: `A Költségnyilvántartó egy ingyenes, saját Supabase felhőt használ az adatok tárolására. Így a te adataid kizárólag a te kezedben vannak.<br><br>
                <strong>Hogyan kezdd el?</strong>
                <ol class="list-decimal pl-5 space-y-1.5 mt-2">
                    <li>Regisztrálj ingyenesen a <a href="https://supabase.com" target="_blank" class="text-indigo-600 underline">supabase.com</a> oldalon.</li>
                    <li>Hozz létre egy új projektet (pl. 'KoltsegWeb').</li>
                    <li>A projekt elkészülte után lépj a <strong>Project Settings / API</strong> menübe.</li>
                    <li>Másold ki a <strong>Project URL</strong>-t és a <strong>Project API key (anon/public)</strong> kulcsot.</li>
                    <li>Nyisd meg a Költségnyilvántartó <strong>Belépés & Felhő</strong> panelét, másold be őket, majd mentsd el!</li>
                </ol>`
            },
            {
                title: "Az SQL Táblaséma létrehozása (Kritikus lépés)",
                content: `A felhő adatbázisodban létre kell hoznod a szükséges táblákat. Ehhez a rendszer fejlesztői debug panelében (kattints 5-ször a láblécben a verziószámra) megtalálod a kész SQL sémát.<br><br>
                <strong>Lépések:</strong>
                <ol class="list-decimal pl-5 space-y-1.5 mt-2">
                    <li>Nyisd meg a fejlesztői debug panelt a lábléc verziófeliratára való 5x kattintással.</li>
                    <li>Lépj a <strong>Supabase</strong> fülre, és kattints az <em>'SQL séma másolása'</em> gombra.</li>
                    <li>A Supabase konzolodon lépj az <strong>SQL Editor</strong> menübe, nyiss egy új lekérdezést (New Query).</li>
                    <li>Illeszd be a vágólapról a kódot, és kattints a <strong>Run</strong> gombra.</li>
                    <li>Amint a táblák elkészültek, a rendszer készen áll a kétirányú szinkronizálásra!</li>
                </ol>`
            },
            {
                title: "Kétirányú Szinkronizáció & Törlésvédelem",
                content: `A szinkronizációs motorunkat úgy terveztük, hogy megvédje az adataidat az akaratlan adatvesztéstől:<br><br>
                <strong>Biztonsági óvintézkedések:</strong>
                <ul class="list-disc pl-5 space-y-1 mt-2">
                    <li><strong>Időbélyeg-alapú összefésülés:</strong> Ha egy tétel helyben és a felhőben is módosul, a rendszer összehasonlítja az utolsó módosítás időpontját, és a legfrissebb adatot tartja meg.</li>
                    <li><strong>Szelektív Push:</strong> Csak a helyben ténylegesen módosult vagy új tételeket töltjük fel, nem írjuk felül vakon a teljes felhőbázist.</li>
                    <li><strong>Kétlépcsős törlés:</strong> A tételek törlése csak explicit felhasználói műveletre történik meg. Offline módban a törlések egy helyi törlési várólistára (Queue) kerülnek, ami az internetkapcsolat visszatérésekor hajtódik végre a felhőben.</li>
                </ul>`
            }
        ]
    },
    {
        id: "offline_pwa",
        title: "📱 Offline működés & PWA telepítés",
        icon: "fas fa-mobile-alt text-emerald-500",
        description: "Hogyan működik az alkalmazás internet nélkül, és hogyan telepítheted natív appként telefonra.",
        articles: [
            {
                title: "Működés internetkapcsolat nélkül",
                content: `A Költségnyilvántartó teljes mértékben <strong>Offline-First</strong> szemléletű. Ez azt jelenti, hogy az alkalmazásnak nincs szüksége folyamatos internetre a működéshez.<br><br>
                Minden művelet (bejegyzés hozzáadása, kategória módosítása, törlés, havi generálás) azonnal végrehajtódik a telefonod saját belső memóriájában (IndexedDB). Ha nincs hálózat, a fejlécben a felhő ikon pirosra vált, de az app zavartalanul fut tovább. Amint újra online leszel, a háttérben futó szinkronizációs motor észreveszi az internetet, és automatikusan elvégzi a szinkronizálást.`
            },
            {
                title: "Telepítés telefonra (PWA)",
                content: `Az alkalmazás egy Progressive Web App (PWA), így natív alkalmazásként telepíthető Androidra és iOS-re is:<br><br>
                <strong>Android & Chrome:</strong>
                Kattints a fejlécben megjelenő 'Telepítés' gombra, vagy a Chrome menüjében válaszd a 'Telepítés az eszközre' (Install app) lehetőséget. Az ikon bekerül a telefonod alkalmazásai közé.<br><br>
                <strong>iOS & Safari:</strong>
                Nyisd meg az alkalmazást Safariban. Kattints a Megosztás (Share) gombra, majd válaszd a 'Hozzáadás a főképernyőhöz' (Add to Home Screen) opciót.`
            },
            {
                title: "Helyi és Felhő biztonsági mentések",
                content: `Bár a felhőszinkronizáció automatikus, javasolt időnként manuális biztonsági mentést is készíteni. Az <strong>Adatkezelés</strong> (adatbázis ikon) menüpontban bármikor letöltheted a teljes adatbázisodat egyetlen titkosítatlan JSON fájlban. Ezt a fájlt később bármelyik másik eszközödön vissza tudod tölteni, akár teljesen offline módban is.`
            }
        ]
    },
    {
        id: "fixed_costs",
        title: "🔄 Fix költségek & Sablonok",
        icon: "fas fa-arrows-rotate text-purple-500",
        description: "Állandó havi kiadások (pl. albérlet, előfizetések) automatizált kezelése.",
        articles: [
            {
                title: "Mik azok a Fix Költségek Sablonjai?",
                content: `Vannak olyan költségek, amelyek minden hónapban ismétlődnek (pl. közös költség, Netflix előfizetés, telefonszámla). Hogy ezeket ne kelljen minden hónapban manuálisan begépelned, sablonként mentheted el őket.<br><br>
                A sablonokat a <strong>Belépés & Beállítások</strong> panel alján tudod kezelni, miután beállítottad az aktív Supabase kapcsolatodat.`
            },
            {
                title: "Automatikus generálás új hónap indításakor",
                content: `Amikor létrehozol egy új hónapot (pl. a fejlécben a <em>'Hónap'</em> gombra kattintva), a rendszer automatikusan megkérdezi, hogy szeretnéd-e legenerálni az aktív fix költség sablonokat az új hónapra. 
                <br><br>
                Ha igennel válaszolsz, az összes elmentett sablonod automatikusan bejegyzésre kerül az új hónap megfelelő kategóriáiba, a megadott összegekkel és fizetési módokkal.`
            }
        ]
    },
    {
        id: "version_changelog",
        title: "🔄 Verziókövetés & Újdonságok",
        icon: "fas fa-code-branch text-blue-500",
        description: "Az alkalmazás legújabb funkciói, javításai és a verziótörténet részletes listája.",
        articles: [
            {
                title: "v4.3.6 — Biztonságos Felhő RESET & Debug Eszközök (Aktuális verzió)",
                content: `<strong>Megjelenés:</strong> 2026-07-12<br><br>
                <strong>Újdonságok és fejlesztések:</strong>
                <ul class="list-disc pl-5 mt-2 space-y-1">
                    <li><strong>Biztonságos Felhő RESET:</strong> Új funkció a Fejlesztői & Debug Panel "Supabase Felhő" fülén, amellyel egyetlen gombnyomással teljesen és tisztára törölhető a teljes felhőbéli Supabase adatbázis (mind a 8 tábla).</li>
                    <li><strong>Kétlépcsős biztonsági megerősítés:</strong> A véletlen törlések elkerülése érdekében a RESET folyamat egy külön ablakban megnyíló, egyedi feloldó jelszót kér a felhasználótól: <code> !!most minden torles!! </code>.</li>
                    <li><strong>Komplex tisztítás:</strong> A törlés kiüríti az összes lokális függő offline változtatást és visszaállítja a hiányzó táblák (tablesMissing) állapotjelzőit is az azonnali, tiszta újrakezdéshez.</li>
                </ul>`
            },
            {
                title: "v4.3.5 — Interaktív Ütközésfeloldás & Tombstone Törlés",
                content: `<strong>Megjelenés:</strong> 2026-07-12<br><br>
                <strong>Újdonságok és fejlesztések:</strong>
                <ul class="list-disc pl-5 mt-2 space-y-1">
                    <li><strong>Interaktív Ütközésfeloldó Panel (Conflict Resolution UI):</strong> Ha ugyanaz az adat a helyi eszközön és a felhőben is módosult az utolsó szinkronizáció óta, egy gyönyörű, áttekinthető modal ablakban választhatja ki, melyik verziót szeretné megtartani.</li>
                    <li><strong>Tombstone-alapú fizikai törlés:</strong> Bevezettük a törölt tételek precíz követését (deleted_records tábla), így ha egy elemet letöröl az egyik eszközén, a szinkronizáció során az a többi eszközéről is fizikailag és biztonságosan törlődik.</li>
                    <li><strong>Séma-verzió követés és migrációs réteg:</strong> Az IndexedDB adatbázis sémát v9-re emeltük, és automatizált migrációs logikával egészítettük ki az offline-first stabilitásért.</li>
                    <li><strong>SQL séma kiterjesztés:</strong> A fejlesztői és hibakereső panelen kimásolható SQL séma frissült a törölt rekordok automatikus követését biztosító táblával.</li>
                </ul>`
            },
            {
                title: "v4.3.4 — Robusztus Szinkronizáció & Supabase Diagnosztika",
                content: `<strong>Megjelenés:</strong> 2026-07-12<br><br>
                <strong>Újdonságok és fejlesztések:</strong>
                <ul class="list-disc pl-5 mt-2 space-y-1">
                    <li><strong>Időtúllépés-védelem (Timeout):</strong> Az összes felhőbeli pull művelet 4 másodperces időtúllépési védelemmel és párhuzamos lekérdezéssel lett felvértezve, így egy esetlegesen akadozó hálózati kapcsolat nem fagyasztja be az ellenőrzést.</li>
                    <li><strong>Automatikus Táblahiba Detektálás:</strong> A rendszer valós időben felismeri, ha a Supabase adatbázisban még nincsenek létrehozva a szükséges táblák (pl. új Supabase fiók vagy friss telepítés esetén).</li>
                    <li><strong>Kiemelt Figyelmeztető Panel:</strong> Ha a táblák hiányoznak, a szinkronizációs panelen azonnal megjelenik egy kiemelt piros figyelmeztetés, ahonnan egyetlen kattintással kimásolható a szükséges SQL séma és elérhető a diagnosztika.</li>
                    <li><strong>Kétirányú adatbiztonság:</strong> Optimalizáltuk a felhőbeli egyedi sor-upsert és delete metódusok hibakezelését és állapot-szinkronizációját.</li>
                </ul>`
            },
            {
                title: "v4.3.3 — Megjelenés Testreszabás & Fejlesztői Eszközök",
                content: `<strong>Megjelenés:</strong> 2026-07-09<br><br>
                <strong>Újdonságok és fejlesztések:</strong>
                <ul class="list-disc pl-5 mt-2 space-y-1">
                    <li><strong>Sötét Mód & Egyedi Háttérszínek:</strong> Új "Megjelenés & Téma" fül a Beállításokban. Kényelmes, szemkímélő Sötét Mód és több finom pasztell háttérszín (Krém, Zsálya, Jég, Levendula, Slate) közül választhat.</li>
                    <li><strong>Súgóból Indítható Fejlesztői Panel:</strong> A Fejlesztői Diagnosztikai Panel mostantól fixen és megbízhatóan elindítható közvetlenül a Súgó modal bal alsó sarkában elhelyezett "Fejlesztői Eszközök" gombbal.</li>
                    <li><strong>Rendszer-szintű Verzió Harmonizáció:</strong> Az összes verziószám (főoldal, lábléc, beállítások és diagnosztika) egységesen követi és mutatja az aktuális v4.3.3 verziót.</li>
                </ul>`
            },
            {
                title: "v4.3.2 — Intelligens Kategória Ikonok",
                content: `<strong>Megjelenés:</strong> 2026-07-08<br><br>
                <strong>Újdonságok és fejlesztések:</strong>
                <ul class="list-disc pl-5 mt-2 space-y-1">
                    <li><strong>Intelligens kategória ikonok (CategoryIcons):</strong> Az alkalmazás automatikusan felismeri a kategória nevét (pl. élelmiszer, rezsi, autó, szórakozás, sport) és egy hozzá passzoló elegáns ikont, valamint színes hátteret társít hozzá.</li>
                    <li><strong>Rugalmas testreszabhatóság:</strong> Ha a felhasználó egyedi színt állít be a kategóriának, a rendszer automatikusan megőrzi és integrálja azt az ikon hátterében és szegélyében.</li>
                    <li><strong>AI integrált előnézet:</strong> Az AI Gyorsfelvitel Modal most már az elemzés után azonnal vizuálisan is megmutatja az intelligens ikont a jóváhagyási kártyán.</li>
                </ul>`
            },
            {
                title: "v4.3.1 — AI Hibakezelés és Biztonságos Visszajelzés",
                content: `<strong>Megjelenés:</strong> 2026-07-08<br><br>
                <strong>Újdonságok és fejlesztések:</strong>
                <ul class="list-disc pl-5 mt-2 space-y-1">
                    <li><strong>AI Hibakezelő Panel:</strong> Ha a megadott szöveg hiányos, érthetetlen, vagy hálózati hiba lép fel, a felület nem fagy ki, hanem egy barátságos hibaüzenetet mutat be.</li>
                    <li><strong>Kontextusfüggő javító tippek:</strong> Hasznos példákkal és tippekkel látjuk el a felhasználót a beviteli mező alatt, hogy miként érdemes megfogalmazni a mondatokat az optimális felismeréshez.</li>
                    <li><strong>Átlátható kvóták:</strong> Biztonságos, szerver-oldali, gyors és teljesen díjmentes lekérdezések a legújabb Gemini 1.5 & 2.0 alapú technológiákkal.</li>
                </ul>`
            },
            {
                title: "v4.3.0 — AI Gyorsfelvitel és Gemini Integráció",
                content: `<strong>Megjelenés:</strong> 2026-07-08<br><br>
                <strong>Újdonságok és fejlesztések:</strong>
                <ul class="list-disc pl-5 mt-2 space-y-1">
                    <li><strong>Gemini AI Asszisztens:</strong> Teljes körű természetes nyelvi költségelemző modul. Írjon be egy egyszerű mondatot (pl. "5000 Ft ebédre kártyával"), és a rendszer automatikusan felbontja azt adatokra!</li>
                    <li><strong>AI Quick-Insert Modal:</strong> Modern, felugró ablak valós idejű visszajelzéssel, amely megmutatja az AI által elemzett kategóriát, hónapot, összeget és fizetési módot még a rögzítés előtt.</li>
                    <li><strong>Automatikus Kategória/Hónap Létrehozás:</strong> Ha az AI új kategóriát vagy hónapot ismer fel a szövegben, a bejegyzés rögzítésekor a rendszer automatikusan és zökkenőmentesen létrehozza azt.</li>
                    <li><strong>Szerver-oldali Biztonság:</strong> A Gemini API kulcsot biztonságos, szerver-oldali proxy-n keresztül kezeljük, megakadályozva a kliens-oldali szivárgást.</li>
                </ul>`
            },
            {
                title: "v4.2.1 — Modal és Érintésvezérlés javítás",
                content: `<strong>Megjelenés:</strong> 2026-07-08<br><br>
                <strong>Újdonságok és fejlesztések:</strong>
                <ul class="list-disc pl-5 mt-2 space-y-1">
                    <li><strong>Határidő szerkesztés modal:</strong> Kijavításra és teljes mértékben stabilizálásra került a határidők szerkesztésére szolgáló modal ablak mentési és mégse/bezáró gombjainak működése.</li>
                    <li><strong>Kategóriák érintésvezérlése:</strong> Megoldottuk a kategóriák hosszú nyomással (longpress) történő átnevezését és törlését, amely mostantól egy modern, kifejezetten mobilbarát műveleti panelt nyit meg finom vizuális haptikus visszajelzéssel.</li>
                    <li><strong>RemindersApp integráció:</strong> Pontosítottuk az emlékeztetők és határidők alrendszerének inicializálását és automatikus renderelési ciklusát.</li>
                    <li><strong>Adatbázis stabilitás:</strong> Különleges hibavédelmi fallback került beépítésre az IndexedDB-ben lévő esetleges nem-egyedi indexek miatti tranzakciós hibák és leállások ellen.</li>
                </ul>`
            },
            {
                title: "v4.2.0 — Felület és Kényelmi Optimalizációk",
                content: `<strong>Megjelenés:</strong> 2026-07-07<br><br>
                <strong>Újdonságok és fejlesztések:</strong>
                <ul class="list-disc pl-5 mt-2 space-y-1">
                    <li><strong>Főoldali Dashboard & Tabos felület:</strong> Megújult az alkalmazás felülete 6 különálló lappal a még tisztább elrendezés, jobb áttekinthetőség és kezelhetőség érdekében.</li>
                    <li><strong>Automatizált verziókezelés:</strong> Központi verzió-nyomonkövető rendszer bevezetése az index.html-ben, a láblécben és a beállításoknál.</li>
                </ul>`
            },
            {
                title: "v4.1.2 — Cellánkénti HUF konverzió",
                content: `<strong>Megjelenés:</strong> 2026-07-07<br><br>
                <strong>Újdonságok és fejlesztések:</strong>
                <ul class="list-disc pl-5 mt-2 space-y-1">
                    <li><strong>Cellánkénti HUF érték:</strong> Ha egy táblázat cellájában EUR érték szerepel, a rendszer mostantól kis számmal zárójelben automatikusan megjeleníti az aktuális árfolyammal átszámolt HUF (Ft) értéket tizedesjegyek nélkül.</li>
                    <li><strong>Súgó kibővítése:</strong> Létrejött ez a részletes verziókövetési fül, ahol visszamenőleg is nyomon követheted az alkalmazás fejlődését.</li>
                    <li><strong>Összehangolt diagramok:</strong> A főoldali diagramok és kimutatások továbbra is a beállított élő/gyorsítótárazott EUR árfolyam alapján számolják a HUF megfelelőket.</li>
                </ul>`
            },
            {
                title: "v4.1.1 — Súgó és Diagnosztikai modal",
                content: `<strong>Megjelenés:</strong> 2026-07-07<br><br>
                <strong>Újdonságok és fejlesztések:</strong>
                <ul class="list-disc pl-5 mt-2 space-y-1">
                    <li><strong>Súgó modal:</strong> Hozzáadásra került a teljesen dinamikus, fülekre osztott Súgó (kérdőjel gomb), amely részletes útmutatást nyújt a beállításokhoz és használathoz.</li>
                    <li><strong>IndexedDB Audit:</strong> Leválasztásra került az adatbázis diagnosztikai és index-újjáépítési funkció az Export Menüről a tisztább felület érdekében.</li>
                    <li><strong>Stabilitási javítások:</strong> Hibajavítások a háttérbeli szinkronizáció és a felhőkapcsolat állapotjelző (LED) működésében.</li>
                </ul>`
            },
            {
                title: "v4.0.0 — OOP Alapú Újratervezés",
                content: `<strong>Megjelenés:</strong> 2026-06-24<br><br>
                <strong>Főbb mérföldkövek:</strong>
                <ul class="list-disc pl-5 mt-2 space-y-1">
                    <li><strong>OOP Refaktor:</strong> A teljes kliensoldali kódrendszer moduláris, objektumorientált (OOP) felépítést kapott a jobb karbantarthatóság érdekében.</li>
                    <li><strong>Intelligens szinkronizáció:</strong> Kétirányú, időbélyeg-alapú szinkronizáció és automatikus konfliktusfeloldás a Supabase felhővel.</li>
                    <li><strong>Offline-First motor:</strong> Ha nincs hálózat, az adatok helyben (IndexedDB) biztonságosan mentésre és sorbaállításra kerülnek, majd automatikusan szinkronizálódnak amint online állapot lép fel.</li>
                </ul>`
            }
        ]
    }
];
