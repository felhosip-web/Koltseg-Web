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
        id: "work_log",
        title: "💼 Munka Nyilvántartás",
        icon: "fas fa-briefcase text-emerald-500",
        description: "Hogyan használd a munka nyilvántartó rendszert a napi feladataid és projektjeid követésére.",
        articles: [
            {
                title: "Mi az a Munka Nyilvántartás?",
                content: `A Munka Nyilvántartás modul (v5.1.0) segítségével nyomon követheted a napi munkáidat, karbantartásokat, fejlesztéseket vagy tetszőleges projekteket.<br><br>
                Minden munka bejegyzés tartalmaz egy nevet, részletes feladatleírást, helyszínt, dátumot, tervezett vagy tényleges időtartamot (napokban) és egy aktuális státuszt.`
            },
            {
                title: "Munkák kezelése és szerkesztése",
                content: `Új munkát az <strong>'Új munka felvitele'</strong> gombbal tudsz rögzíteni. 
                <br><br>
                <strong>Műveletek a meglévő bejegyzésekkel:</strong>
                <ul class="list-disc pl-5 mt-2 space-y-1">
                    <li><strong>Szerkesztés:</strong> Kattints a sor végén lévő <i class="fas fa-edit text-emerald-600"></i> ikonra, vagy asztali gépen kattints duplán a sorra. Mobilon a sor hosszan tartó megnyomásával is megnyithatod a szerkesztőt.</li>
                    <li><strong>Törlés:</strong> Nyisd meg a szerkesztőt, majd kattints a bal alsó sarokban található <strong>'Törlés'</strong> gombra és erősítsd meg a szándékod.</li>
                    <li><strong>Státusz módosítása:</strong> Háromféle státuszt választhatsz: <em>Folyamatban</em> (🟡), <em>Elvégzett</em> (🟢) vagy <em>Meghiúsult</em> (🔴).</li>
                </ul>`
            },
            {
                title: "Szinkronizáció és offline működés",
                content: `A munkák nyilvántartása is teljes mértékben támogatja a kétirányú felhőszinkronizációt és az <strong>Offline-First</strong> működést. Internetkapcsolat nélkül az adatok az eszköz belső adatbázisába mentődnek, és amint online állapotba kerülsz, automatikusan felszinkronizálódnak a Supabase felhőbe a többi eszközödre is.`
            }
        ]
    },
    {
        id: "installed_modules",
        title: "🧩 Aktív & Telepített Modulok",
        icon: "fas fa-cubes text-purple-500",
        description: "A rendszerben jelenleg elérhető, futó vagy telepített bővítmények és modulok dinamikus listája.",
        articles: [
            {
                id: "dynamic_modules_list",
                title: "🔌 Telepített Modulok és Bővítmények (Valós idejű élő lista)",
                content: `A rendszerben telepített és regisztrált modulok állapota dinamikusan, élőben követhető. Amennyiben új modult adsz hozzá, az azonnal megjelenik itt; ha törölsz egy modult, automatikusan kikerül a listából.<br><br>
                __DYNAMIC_MODULES_LIST__`
            }
        ]
    },
    {
        id: "version_changelog",
        title: "🔄 Verziókövetés & Újdonságok",
        icon: "fas fa-code-branch text-blue-500",
        description: "Az alkalmazás legújabb funkciói, javításai és a verziótörténet részletes listája.",
        articles: [
        ]
    }
];
