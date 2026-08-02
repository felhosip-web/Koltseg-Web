// js/gdrive-backup.js - Google Drive Backup rendszer
// OAuth 2.0 + Drive API v3 integráció

export class GoogleDriveBackup {
    constructor(app) {
        this.app = app;
        this.accessToken = null;
        this.tokenExpiry = null;
        this.isAuthorized = false;
        this.clientId = localStorage.getItem('gdrive_client_id') || '';
        this.folderName = 'KoltsegNyilvantarto_Backups';
        this.folderId = null;
        this.maxBackups = 10;
        this._tokenClient = null;
    }

    // ================================================================
    // === KONFIGURÁCIÓ ===
    // ================================================================

    setClientId(clientId) {
        this.clientId = clientId;
        localStorage.setItem('gdrive_client_id', clientId);
    }

    getClientId() {
        return this.clientId;
    }

    isConfigured() {
        return !!this.clientId;
    }

    // ================================================================
    // === GOOGLE IDENTITY SERVICES (GIS) INICIALIZÁCIÓ ===
    // ================================================================

    async initGIS() {
        if (!this.clientId) {
            throw new Error('Google Drive Client ID nincs beállítva!');
        }

        // Ellenőrizzük, hogy a GIS library be van-e töltve
        if (typeof google === 'undefined' || !google.accounts?.oauth2) {
            throw new Error('A Google Identity Services library nincs betöltve! Ellenőrizze az internetkapcsolatot.');
        }

        return new Promise((resolve, reject) => {
            try {
                this._tokenClient = google.accounts.oauth2.initTokenClient({
                    client_id: this.clientId,
                    scope: 'https://www.googleapis.com/auth/drive.file',
                    callback: (tokenResponse) => {
                        if (tokenResponse.error) {
                            this.isAuthorized = false;
                            reject(new Error(`OAuth hiba: ${tokenResponse.error}`));
                            return;
                        }
                        this.accessToken = tokenResponse.access_token;
                        this.tokenExpiry = Date.now() + (tokenResponse.expires_in * 1000);
                        this.isAuthorized = true;
                        localStorage.setItem('gdrive_last_auth', Date.now().toString());
                        console.log('[GDRIVE] ✅ Sikeres hitelesítés');
                        resolve(tokenResponse);
                    },
                    error_callback: (error) => {
                        this.isAuthorized = false;
                        reject(new Error(`OAuth hiba: ${error.type || error.message || 'Ismeretlen hiba'}`));
                    }
                });
                resolve(this._tokenClient);
            } catch (err) {
                reject(err);
            }
        });
    }

    // ================================================================
    // === HITELESÍTÉS ===
    // ================================================================

    async authorize() {
        if (!this._tokenClient) {
            await this.initGIS();
        }

        return new Promise((resolve, reject) => {
            try {
                // A callback-et az initGIS-ben állítjuk be
                const originalCallback = this._tokenClient.callback;
                this._tokenClient.callback = (tokenResponse) => {
                    if (tokenResponse.error) {
                        this.isAuthorized = false;
                        reject(new Error(`OAuth hiba: ${tokenResponse.error}`));
                        return;
                    }
                    this.accessToken = tokenResponse.access_token;
                    this.tokenExpiry = Date.now() + (tokenResponse.expires_in * 1000);
                    this.isAuthorized = true;
                    localStorage.setItem('gdrive_last_auth', Date.now().toString());
                    console.log('[GDRIVE] ✅ Hitelesítés sikeres');
                    resolve(tokenResponse);
                };
                this._tokenClient.requestAccessToken({ prompt: '' });
            } catch (err) {
                reject(err);
            }
        });
    }

    async ensureAuthorized() {
        if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry - 60000) {
            return; // Token még érvényes (legalább 1 percig)
        }
        await this.authorize();
    }

    disconnect() {
        if (this.accessToken) {
            try {
                google.accounts.oauth2.revoke(this.accessToken);
            } catch (e) {
                console.warn('[GDRIVE] Revoke hiba:', e);
            }
        }
        this.accessToken = null;
        this.tokenExpiry = null;
        this.isAuthorized = false;
        this.folderId = null;
        localStorage.removeItem('gdrive_last_auth');
        console.log('[GDRIVE] Lecsatlakoztatva');
    }

    // ================================================================
    // === DRIVE API HÍVÁSOK ===
    // ================================================================

    async _driveRequest(url, options = {}) {
        await this.ensureAuthorized();

        const response = await fetch(url, {
            ...options,
            headers: {
                'Authorization': `Bearer ${this.accessToken}`,
                ...options.headers
            }
        });

        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`Drive API hiba (${response.status}): ${errorBody}`);
        }

        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            return response.json();
        }
        return response.text();
    }

    // ================================================================
    // === MAPPA KEZELÉS ===
    // ================================================================

    async _getOrCreateFolder() {
        if (this.folderId) return this.folderId;

        // Keresés: létezik-e már a mappa?
        const searchResult = await this._driveRequest(
            `https://www.googleapis.com/drive/v3/files?q=name='${this.folderName}'+and+mimeType='application/vnd.google-apps.folder'+and+trashed=false&fields=files(id,name)`
        );

        if (searchResult.files && searchResult.files.length > 0) {
            this.folderId = searchResult.files[0].id;
            console.log(`[GDRIVE] Meglévő mappa: ${this.folderId}`);
            return this.folderId;
        }

        // Mappa létrehozása
        const folderMetadata = {
            name: this.folderName,
            mimeType: 'application/vnd.google-apps.folder'
        };

        const created = await this._driveRequest(
            'https://www.googleapis.com/drive/v3/files',
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(folderMetadata)
            }
        );

        this.folderId = created.id;
        console.log(`[GDRIVE] Új mappa létrehozva: ${this.folderId}`);
        return this.folderId;
    }

    // ================================================================
    // === BACKUP MŰVELETEK ===
    // ================================================================

    /**
     * JSON backup feltöltése a Google Drive-ra
     * @param {Object} backupData - A backup adat objektum
     * @returns {Promise<Object>} - A feltöltött fájl metaadatai
     */
    async uploadBackup(backupData) {
        const folderId = await this._getOrCreateFolder();

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const fileName = `backup_${timestamp}.json`;

        // Multipart upload
        const metadata = {
            name: fileName,
            parents: [folderId],
            mimeType: 'application/json',
            description: `Költség Nyilvántartó backup - ${new Date().toLocaleString('hu-HU')}`
        };

        const boundary = '-------314159265358979323846';
        const delimiter = '\r\n--' + boundary + '\r\n';
        const closeDelimiter = '\r\n--' + boundary + '--';

        const body =
            delimiter +
            'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
            JSON.stringify(metadata) +
            delimiter +
            'Content-Type: application/json\r\n\r\n' +
            JSON.stringify(backupData, null, 2) +
            closeDelimiter;

        const result = await this._driveRequest(
            'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,size,createdTime',
            {
                method: 'POST',
                headers: {
                    'Content-Type': `multipart/related; boundary=${boundary}`
                },
                body
            }
        );

        console.log(`[GDRIVE] ✅ Backup feltöltve: ${result.name} (${result.id})`);

        // Rotáció: régi backup-ok törlése
        await this._rotateBackups();

        return result;
    }

    /**
     * Backup fájlok listázása
     * @returns {Promise<Array>}
     */
    async listBackups() {
        const folderId = await this._getOrCreateFolder();

        const result = await this._driveRequest(
            `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents+and+trashed=false&orderBy=createdTime+desc&fields=files(id,name,size,createdTime,modifiedTime)&pageSize=50`
        );

        return result.files || [];
    }

    /**
     * Backup letöltése
     * @param {string} fileId - Google Drive fájl ID
     * @returns {Promise<Object>} - A backup adat objektum
     */
    async downloadBackup(fileId) {
        const content = await this._driveRequest(
            `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`
        );

        // Ha szöveges válasz jött, parse-oljuk
        if (typeof content === 'string') {
            return JSON.parse(content);
        }
        return content;
    }

    /**
     * Backup törlése
     * @param {string} fileId
     */
    async deleteBackup(fileId) {
        await this.ensureAuthorized();
        
        const response = await fetch(
            `https://www.googleapis.com/drive/v3/files/${fileId}`,
            {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`
                }
            }
        );

        if (!response.ok && response.status !== 204) {
            throw new Error(`Törlés sikertelen (${response.status})`);
        }

        console.log(`[GDRIVE] 🗑️ Backup törölve: ${fileId}`);
    }

    // ================================================================
    // === ROTÁCIÓ ===
    // ================================================================

    async _rotateBackups() {
        try {
            const backups = await this.listBackups();
            
            if (backups.length > this.maxBackups) {
                const toDelete = backups.slice(this.maxBackups);
                for (const file of toDelete) {
                    try {
                        await this.deleteBackup(file.id);
                        console.log(`[GDRIVE] Rotáció: ${file.name} törölve`);
                    } catch (e) {
                        console.warn(`[GDRIVE] Rotáció hiba: ${file.name}`, e);
                    }
                }
            }
        } catch (e) {
            console.warn('[GDRIVE] Rotáció ellenőrzés hiba:', e);
        }
    }

    // ================================================================
    // === ÁLLAPOT LEKÉRDEZÉS ===
    // ================================================================

    getStatus() {
        return {
            isConfigured: this.isConfigured(),
            isAuthorized: this.isAuthorized,
            clientId: this.clientId ? `${this.clientId.substring(0, 20)}...` : null,
            tokenExpiry: this.tokenExpiry ? new Date(this.tokenExpiry).toLocaleString('hu-HU') : null,
            lastAuth: localStorage.getItem('gdrive_last_auth') 
                ? new Date(Number(localStorage.getItem('gdrive_last_auth'))).toLocaleString('hu-HU') 
                : null,
            folderId: this.folderId
        };
    }

    /**
     * Teljes teszt: konfiguráció → hitelesítés → mappa → lista → upload → download → törlés
     * @returns {Promise<Object>} Részletes teszteredmény
     */
    async runDiagnostic() {
        const results = {
            timestamp: new Date().toISOString(),
            steps: [],
            overallSuccess: false
        };

        const addStep = (name, success, detail = '') => {
            results.steps.push({ name, success, detail, time: new Date().toISOString() });
        };

        try {
            // 1. Konfiguráció
            if (!this.isConfigured()) {
                addStep('Konfiguráció', false, 'Client ID nincs beállítva');
                return results;
            }
            addStep('Konfiguráció', true, `Client ID: ${this.clientId.substring(0, 20)}...`);

            // 2. GIS inicializáció
            try {
                await this.initGIS();
                addStep('GIS Init', true, 'Token client létrehozva');
            } catch (e) {
                addStep('GIS Init', false, e.message);
                return results;
            }

            // 3. Hitelesítés
            try {
                await this.authorize();
                addStep('Hitelesítés', true, `Token érvényes: ${new Date(this.tokenExpiry).toLocaleTimeString('hu-HU')}`);
            } catch (e) {
                addStep('Hitelesítés', false, e.message);
                return results;
            }

            // 4. Mappa ellenőrzés
            try {
                const folderId = await this._getOrCreateFolder();
                addStep('Mappa', true, `ID: ${folderId}`);
            } catch (e) {
                addStep('Mappa', false, e.message);
                return results;
            }

            // 5. Backup lista
            try {
                const backups = await this.listBackups();
                addStep('Backup lista', true, `${backups.length} backup található`);
            } catch (e) {
                addStep('Backup lista', false, e.message);
            }

            // 6. Teszt backup feltöltés
            let testFileId = null;
            try {
                const testData = {
                    _diagnostic: true,
                    timestamp: new Date().toISOString(),
                    message: 'Ez egy diagnosztikai teszt backup.'
                };
                const uploaded = await this.uploadBackup(testData);
                testFileId = uploaded.id;
                addStep('Feltöltés', true, `Fájl: ${uploaded.name} (${uploaded.id})`);
            } catch (e) {
                addStep('Feltöltés', false, e.message);
            }

            // 7. Teszt letöltés
            if (testFileId) {
                try {
                    const downloaded = await this.downloadBackup(testFileId);
                    const isValid = downloaded._diagnostic === true;
                    addStep('Letöltés', isValid, isValid ? 'Adat integritás OK' : 'Adat sérült!');
                } catch (e) {
                    addStep('Letöltés', false, e.message);
                }
            }

            // 8. Teszt törlés
            if (testFileId) {
                try {
                    await this.deleteBackup(testFileId);
                    addStep('Törlés', true, 'Teszt fájl törölve');
                } catch (e) {
                    addStep('Törlés', false, e.message);
                }
            }

            results.overallSuccess = results.steps.every(s => s.success);
        } catch (e) {
            addStep('Általános hiba', false, e.message);
        }

        return results;
    }
}
