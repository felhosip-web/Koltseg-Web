// js/category-icons.js
// Intelligens kategória-ikon társító segédosztály természetes nyelvű elemzéssel

export class CategoryIcons {
    /**
     * Kategória név alapján meghatározza a leginkább passzoló ikont és színeket
     * @param {string} name - Kategória megnevezése
     * @returns {Object} { iconClass: string, bgClass: string, textClass: string, defaultColor: string }
     */
    static getIconData(name) {
        if (!name || typeof name !== 'string') {
            return {
                iconClass: 'fas fa-tag',
                bgClass: 'bg-slate-100',
                textClass: 'text-slate-500',
                defaultColor: '#94a3b8'
            };
        }

        const norm = name.toLowerCase().trim();

        // Élelmiszer / Étkezés / Szupermarket
        if (this._matches(norm, ['élelmiszer', 'kaja', 'bevásárlás', 'lidl', 'aldi', 'tesco', 'spar', 'bolt', 'ebéd', 'vacsora', 'reggeli', 'étterem', 'mcdonald', 'meki', 'pizza', 'kávé', 'szupermarket', 'gasztro', 'pékség', 'cukrászda', 'piac'])) {
            return {
                iconClass: 'fas fa-utensils',
                bgClass: 'bg-amber-100',
                textClass: 'text-amber-600',
                defaultColor: '#f59e0b'
            };
        }

        // Lakás / Rezsi / Otthon
        if (this._matches(norm, ['rezsi', 'lakbér', 'albérlet', 'fűtés', 'gáz', 'villany', 'áram', 'víz', 'csatorna', 'szemét', 'társasház', 'közös költség', 'internet', 'tévé', 'telefon', 'hitel', 'lakás', 'otthon', 'bútor', 'felújítás', 'lakásbiztosítás', 'ikea', 'obi', 'praktiker'])) {
            return {
                iconClass: 'fas fa-home',
                bgClass: 'bg-blue-100',
                textClass: 'text-blue-600',
                defaultColor: '#3b82f6'
            };
        }

        // Közlekedés / Autó / Utazás
        if (this._matches(norm, ['autó', 'kocsi', 'benzin', 'gázolaj', 'üzemanyag', 'tankolás', 'szerviz', 'parkolás', 'bkv', 'volán', 'vonat', 'bérlet', 'jegy', 'taxi', 'uber', 'bolt taxi', 'repülő', 'pályamatrica', 'matrica', 'autópálya', 'gumi', 'mosó'])) {
            return {
                iconClass: 'fas fa-car',
                bgClass: 'bg-cyan-100',
                textClass: 'text-cyan-600',
                defaultColor: '#06b6d4'
            };
        }

        // Egészség / Gyógyászat
        if (this._matches(norm, ['egészség', 'orvos', 'gyógyszer', 'patika', 'magánorvos', 'fogorvos', 'vitamin', 'szemüveg', 'klinika', 'kórház', 'kezelés', 'recept', 'gyógytorna'])) {
            return {
                iconClass: 'fas fa-heartbeat',
                bgClass: 'bg-rose-100',
                textClass: 'text-rose-600',
                defaultColor: '#f43f5e'
            };
        }

        // Szórakozás / Kikapcsolódás / Hobbi
        if (this._matches(norm, ['szórakozás', 'mozi', 'színház', 'buli', 'koncert', 'sör', 'bor', 'kocsma', 'hobbi', 'játék', 'netflix', 'spotify', 'könyv', 'újság', 'fesztivál', 'kreatív', 'gaming', 'steam', 'playstation'])) {
            return {
                iconClass: 'fas fa-film',
                bgClass: 'bg-purple-100',
                textClass: 'text-purple-600',
                defaultColor: '#a855f7'
            };
        }

        // Öltözködés / Vásárlás / Ruházat
        if (this._matches(norm, ['ruha', 'cipő', 'vásárlás', 'pláza', 'ruhadarab', 'hm', 'zara', 'decathlon', 'divat', 'gardrób', 'szépségápolás', 'fodrász', 'kozmetikus', 'borbély'])) {
            return {
                iconClass: 'fas fa-shopping-bag',
                bgClass: 'bg-pink-100',
                textClass: 'text-pink-600',
                defaultColor: '#ec4899'
            };
        }

        // Bevételek / Fizetés / Utalás
        if (this._matches(norm, ['fizetés', 'bér', 'jövedelem', 'utalás', 'extra', 'jutalom', 'osztalék', 'bevétel', 'számla', 'gyes', 'nyugdíj', 'támogatás'])) {
            return {
                iconClass: 'fas fa-wallet',
                bgClass: 'bg-emerald-100',
                textClass: 'text-emerald-600',
                defaultColor: '#10b981'
            };
        }

        // Megtakarítás / Befektetés / Pénzügyek
        if (this._matches(norm, ['megtakarítás', 'befektetés', 'részvény', 'kripto', 'arany', 'széf', 'tőzsde', 'kamat', 'kötvény', 'állampapír'])) {
            return {
                iconClass: 'fas fa-piggy-bank',
                bgClass: 'bg-indigo-100',
                textClass: 'text-indigo-600',
                defaultColor: '#6366f1'
            };
        }

        // Oktatás / Tanulás / Önfejlesztés
        if (this._matches(norm, ['iskola', 'tanulás', 'kurzus', 'egyetem', 'könyv', 'oktatás', 'szeminárium', 'tanfolyam', 'nyelvtanulás', 'udemy', 'könyvtár'])) {
            return {
                iconClass: 'fas fa-graduation-cap',
                bgClass: 'bg-violet-100',
                textClass: 'text-violet-600',
                defaultColor: '#8b5cf6'
            };
        }

        // Ajándék / Adomány
        if (this._matches(norm, ['ajándék', 'adomány', 'szülinap', 'névnap', 'karácsony', 'meglepetés', 'jótékonyság'])) {
            return {
                iconClass: 'fas fa-gift',
                bgClass: 'bg-red-100',
                textClass: 'text-red-600',
                defaultColor: '#ef4444'
            };
        }

        // Sport / Fitness
        if (this._matches(norm, ['sport', 'fitness', 'edzés', 'konditerem', 'uszoda', 'jóga', 'bérlet', 'foci', 'futás', 'bringa', 'kerékpár'])) {
            return {
                iconClass: 'fas fa-dumbbell',
                bgClass: 'bg-emerald-100',
                textClass: 'text-emerald-700',
                defaultColor: '#047857'
            };
        }

        // Kisállat / Kedvenc
        if (this._matches(norm, ['állat', 'kutya', 'macska', 'cica', 'táp', 'állatorvos', 'pet', 'fressnapf', 'kutyatáp'])) {
            return {
                iconClass: 'fas fa-paw',
                bgClass: 'bg-orange-100',
                textClass: 'text-orange-600',
                defaultColor: '#f97316'
            };
        }

        // Adó / NAV / Könyvelő
        if (this._matches(norm, ['adó', 'nav', 'illeték', 'tb', 'könyvelő', 'vállalkozás', 'iparűzési'])) {
            return {
                iconClass: 'fas fa-file-invoice-dollar',
                bgClass: 'bg-slate-200',
                textClass: 'text-slate-700',
                defaultColor: '#475569'
            };
        }

        // Biztosítás / Biztonság
        if (this._matches(norm, ['biztosítás', 'casco', 'generali', 'allianz', 'lakásbiztosítás', 'utasbiztosítás'])) {
            return {
                iconClass: 'fas fa-shield-alt',
                bgClass: 'bg-teal-100',
                textClass: 'text-teal-600',
                defaultColor: '#14b8a6'
            };
        }

        // Alapértelmezett cimke
        return {
            iconClass: 'fas fa-tag',
            bgClass: 'bg-indigo-50',
            textClass: 'text-indigo-500',
            defaultColor: '#818cf8'
        };
    }

    /**
     * Eldönti, hogy a keresett kifejezések közül bármelyik szerepel-e a kategória nevében
     * @private
     */
    static _matches(value, keywords) {
        return keywords.some(kw => value.includes(kw));
    }
}
