// js/version-manager.js - Dinamikus verziókezelés

export class VersionManager {
    constructor() {
        this.version = null;
        this.build = null;
        this.release = null;
        this.changelog = [];
        this.loaded = false;
    }

    /**
     * Verzió betöltése version.json-ból
     */
    async load() {
        try {
            const response = await fetch('./version.json');
            if (!response.ok) throw new Error('Version file not found');
            
            const data = await response.json();
            this.version = data.version || '0.0.0';
            this.build = data.build || new Date().toISOString();
            this.release = data.release || 'stable';
            this.changelog = data.changelog || [];
            this.loaded = true;
            
            console.log(`[VERSION] 🏷️ ${this.version} (${this.release}) - Build: ${this.build}`);
            return this;
        } catch (e) {
            console.warn('[VERSION] Fallback verzió használat:', e);
            this.version = '4.0.0';
            this.build = new Date().toISOString();
            this.release = 'stable';
            this.loaded = true;
            return this;
        }
    }

    /**
     * Verzió összehasonlítása (semver)
     */
    compare(v1, v2) {
        const parts1 = v1.split('.').map(Number);
        const parts2 = v2.split('.').map(Number);
        
        for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
            const p1 = parts1[i] || 0;
            const p2 = parts2[i] || 0;
            if (p1 > p2) return 1;
            if (p1 < p2) return -1;
        }
        return 0;
    }

    /**
     * Van-e újabb verzió
     */
    isNewerThan(version) {
        if (!this.loaded) return false;
        return this.compare(this.version, version) > 0;
    }

    /**
     * Van-e elérhető frissítés (remote verzió ellenőrzése)
     */
    async checkForUpdate() {
        try {
            const response = await fetch('./version.json', { cache: 'no-cache' });
            if (!response.ok) return null;
            
            const remote = await response.json();
            const remoteVersion = remote.version || '0.0.0';
            
            if (this.isNewerThan(remoteVersion)) {
                return {
                    current: this.version,
                    latest: remoteVersion,
                    build: remote.build,
                    changelog: remote.changelog || []
                };
            }
            return null;
        } catch (e) {
            console.warn('[VERSION] Frissítés ellenőrzés sikertelen:', e);
            return null;
        }
    }

    /**
     * Verzió string formátumban (UI-hoz)
     */
    toString() {
        return `v${this.version}`;
    }

    /**
     * Teljes verzió információ (badge-hoz)
     */
    getFullInfo() {
        return {
            version: this.version,
            build: this.build,
            release: this.release,
            short: this.toString(),
            label: `v${this.version}${this.release !== 'stable' ? ` (${this.release})` : ''}`
        };
    }

    /**
     * Changelog szöveg formázása
     */
    getFormattedChangelog() {
        if (!this.changelog || this.changelog.length === 0) {
            return 'Nincs elérhető változásnapló.';
        }

        let text = '';
        for (const entry of this.changelog) {
            text += `📦 ${entry.version} (${entry.date})\n`;
            for (const change of entry.changes) {
                text += `  ${change}\n`;
            }
            text += '\n';
        }
        return text.trim();
    }
}

// Singleton példány (globális eléréshez)
let instance = null;

export function getVersionManager() {
    if (!instance) {
        instance = new VersionManager();
    }
    return instance;
}