// js/ui-controller.js
import { DataOperationController } from './data-operation-controller.js';
import { CellModalController } from './cell-modal-controller.js';
import { InputModalController } from './input-modal-controller.js';

export class UIController {
    constructor(app) {
        this.app = app;
        this.dataOps = new DataOperationController(app);
        this.cellModal = new CellModalController(app);
        this.inputModal = new InputModalController(app);
    }

    bindStaticEvents() {
        // Fő gombok
        document.getElementById('btnNewItem')?.addEventListener('click', () => this.inputModal.open('item'));
        document.getElementById('btnNewMonth')?.addEventListener('click', () => this.inputModal.open('month'));
        document.getElementById('btnSettings')?.addEventListener('click', () => this.togglePanel('settingsPanel'));
        document.getElementById('btnDataControl')?.addEventListener('click', () => this.togglePanel('exportMenu'));

        // Beállítások mentése
        document.getElementById('btnSaveSettings')?.addEventListener('click', async () => {
            this.app.renderer.updateFooterStatus('Beállítások mentése...', false);
            try {
                const newUrl = document.getElementById('supabaseUrlInput')?.value || '';
                const newKey = document.getElementById('supabaseKeyInput')?.value || '';
                const newRate = Number(document.getElementById('eurRateInput')?.value || 400);
                const useCloud = document.getElementById('supabaseToggle')?.checked || false;

                if (!this.app.settings) this.app.settings = {};
                this.app.settings.eurRate = newRate;
                this.app.eurRate = newRate;
                if (this.app.config) this.app.config.eurRate = newRate;

                localStorage.setItem('eurRate', newRate);
                localStorage.setItem('matrix_settings_eurRate', newRate);

                if (typeof this.app.saveSettings === 'function') {
                    await this.app.saveSettings({ url: newUrl, key: newKey, eurRate: newRate, useCloud });
                }

                this.app.hmiNotif?.showToast('Beállítások sikeresen rögzítve!', 'success');
                this.togglePanel('settingsPanel');
                this.app.renderer.renderTable();
                this.app.renderer.renderSummary();
                this.app.renderer.updateFooterStatus('Rendszer üzemkész - Árfolyam frissítve', false);
            } catch (err) {
                console.error('[SETTINGS SAVE ERR]', err);
                this.app.hmiNotif?.showToast('Hiba a mentés során!', 'error');
                this.app.renderer.updateFooterStatus('MENTÉSI HIBA!', true);
            }
        });

        // Input modal gombok
        document.getElementById('btnCancelInputModal')?.addEventListener('click', () => this.inputModal.close());
        document.getElementById('hmiInputSaveBtn')?.addEventListener('click', () => this.inputModal.save());

        // Cell modal gombok
        document.getElementById('btnCancelCellModal')?.addEventListener('click', () => this.cellModal.close());
        document.getElementById('btnCloseCellModalX')?.addEventListener('click', () => this.cellModal.close());
        document.getElementById('btnSaveCellModal')?.addEventListener('click', () => this.cellModal.save());

        // Színválasztók
        document.querySelectorAll('.color-selector-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.color-selector-btn').forEach(b => b.classList.remove('ring-4', 'ring-black'));
                e.currentTarget.classList.add('ring-4', 'ring-black');
                this.cellModal.selectedColor = e.currentTarget.getAttribute('data-color');
            });
        });
 
        document.getElementById('btnForceSync')?.addEventListener('click', () => {
          this.togglePanel('exportMenu');
          this.openSyncModal(); // Új modal megnyitása
        });
        document.getElementById('btnExportExcel')?.addEventListener('click', () => {
            this.togglePanel('exportMenu');
            this.dataOps.exportExcel();
        });
        document.getElementById('btnExportPdf')?.addEventListener('click', () => {
            this.togglePanel('exportMenu');
            this.dataOps.exportPdf();
        });
        document.getElementById('btnExportJson')?.addEventListener('click', () => {
            this.togglePanel('exportMenu');
            this.dataOps.exportJson();
        });
        document.getElementById('btnImportJson')?.addEventListener('click', () => {
            this.togglePanel('exportMenu');
            this.dataOps.importJson();
        });
        // Backup gombok
document.getElementById('btnRestoreBackup')?.addEventListener('click', () => {
    this.togglePanel('exportMenu');
    this.dataOps.restoreFromLocalBackup();
});

document.getElementById('btnForceBackup')?.addEventListener('click', () => {
    this.togglePanel('exportMenu');
    this.app._performBackup();
    this.app.hmiNotif.showToast('✅ Backup mentés kész!', 'success');
});
        document.getElementById('btnWipeDatabase')?.addEventListener('click', async () => {
            this.togglePanel('exportMenu');
            await this.dataOps.wipeDatabase();
        });
    }

    togglePanel(id) {
        document.getElementById(id)?.classList.toggle('hidden');
    }

    // A cella kattintásokat a renderer hívja, ide delegáljuk
    handleCellClick(cellElement) {
        this.cellModal.open(cellElement);
    }

    handleRenameItem(itemId, currentName) {
        const input = document.getElementById('hmiInputValue');
        const title = document.getElementById('hmiInputTitle');
        const label = document.getElementById('hmiInputLabel');
        const colorContainer = document.getElementById('hmiColorContainer');
        
        title.textContent = 'Kategória átnevezése';
        label.textContent = 'Új név';
        input.value = currentName || '';
        input.type = 'text';
        colorContainer?.classList.add('hidden');
        
        const modal = document.getElementById('hmiInputModal');
        modal.classList.remove('hidden');
        input.focus();
        input.select();

        const saveBtn = document.getElementById('hmiInputSaveBtn');
        const originalOnClick = saveBtn.onclick;

        saveBtn.onclick = async () => {
            const newName = input.value.trim();
            if (!newName || newName === currentName) {
                modal.classList.add('hidden');
                saveBtn.onclick = originalOnClick;
                return;
            }

            try {
                await this.app.items.update(itemId, { name: newName });
                await this.app.items.load();
                this.app.renderer.renderTable();
                this.app.hmiNotif.showToast('Kategória átnevezve!', 'success');
            } catch (err) {
                console.error(err);
                this.app.hmiNotif.showToast('Hiba az átnevezés során!', 'error');
            }

            modal.classList.add('hidden');
            saveBtn.onclick = originalOnClick;
        };
    
        // Ha bezárják a modált, állítsuk vissza
        const closeHandler = () => {
            saveBtn.onclick = originalOnClick;
            document.removeEventListener('click', closeHandler);
        };
        document.getElementById('btnCancelInputModal').addEventListener('click', closeHandler);
    }

    // Sor törlés kezelése (a renderer hívja)
    async handleRowDeleteSequence(itemIdStr, itemName) {
        const itemId = parseInt(itemIdStr);
        if (isNaN(itemId)) return;
        const allEntries = this.app.entries.entries;
        const associatedEntries = allEntries.filter(e => e.cellKey && e.cellKey.startsWith(`${itemId}_`));

        const confirmed = await this.app.hmiNotif.showConfirm({
           title: '⚠️ KRITIKUS: Kategóriasor törlése',
           message: `Biztosan törölni szeretné a teljes "${itemName.toUpperCase()}" kategóriát az összes havi rész-tételével (${associatedEntries.length} db) együtt?`,
          type: 'danger',
           confirmText: 'SOR TÖRLÉSE'
         });

        if (confirmed) {
            try {
                this.app.renderer.updateFooterStatus('Tranzakciók törlése...', false);
                for (const entry of associatedEntries) {
                    await this.app.entries.deleteEntry(entry.id).catch(e => console.warn('Entry már törölve:', entry.id));
                }
                await this.app.items.delete(itemId).catch(async (managerError) => {
                    console.warn('[HMI WARNING] ItemManager hibát dobott, direkt DB bypass aktív:', managerError);
                    const dbRaw = this.app.db.db || this.app.db._db;
                    if (dbRaw) {
                        await new Promise((resolve, reject) => {
                            const transaction = dbRaw.transaction(['items'], 'readwrite');
                            const store = transaction.objectStore('items');
                            const request = store.delete(itemId);
                            request.onsuccess = () => resolve();
                            request.onerror = () => reject(request.error);
                        });
                    }
                });
                await this.app.items.load().catch(() => {});
                await this.app.entries.load().catch(() => {});
                this.app.items.items = this.app.items.items.filter(i => i.id !== itemId);
                this.app.entries.entries = this.app.entries.entries.filter(e => !e.cellKey || !e.cellKey.startsWith(`${itemId}_`));
                this.app.hmiNotif.showToast(`"${itemName}" sikeresen eltávolítva.`, 'success');
                this.app.renderer.updateFooterStatus('Sikeres fizikai törlés', false);
                this.app.renderer.renderTable();
                this.app.renderer.renderSummary();
            } catch (error) {
                console.error('[HMI PURGE CRITICAL ERROR]', error);
                this.app.hmiNotif.showToast('Kritikus hiba, de a felület frissítve!', 'error');
                this.app.renderer.updateFooterStatus('Törlési kényszerítés aktív', true);
                this.app.items.items = this.app.items.items.filter(i => i.id !== itemId);
                this.app.renderer.renderTable();
                this.app.renderer.renderSummary();
            }
        }
    }
    
    // ui-controller.js - Új metódus

openSyncModal() {
    const modal = document.getElementById('syncModal');
    const pullBtn = document.getElementById('btnPullData');
    const pushBtn = document.getElementById('btnPushData');
    const executeBtn = document.getElementById('btnExecuteSync');
    const statusText = document.getElementById('syncStatusText');
    const details = document.getElementById('syncDetails');
    
    // Modal megnyitása
    modal.classList.remove('hidden');
    
    // Állapot visszaállítása
    statusText.textContent = 'Kattints a "Letöltés" vagy "Feltöltés" gombra az adatok ellenőrzéséhez.';
    document.getElementById('syncLed').className = 'w-3 h-3 rounded-full bg-gray-400';
    executeBtn.disabled = true;
    
    // Pull adatok ellenőrzése
    pullBtn.onclick = async () => {
        pullBtn.disabled = true;
        pullBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Ellenőrzés...';
        details.innerHTML = '<p class="text-gray-400 italic">Adatok lekérése...</p>';
        
        try {
            const stats = await this.app.syncManager.getPullStats();
            const total = Object.values(stats).reduce((sum, v) => sum + v, 0);
            
            // Statisztika megjelenítése
            document.getElementById('pullStats').innerHTML = `
                <span class="font-bold text-blue-600">${total}</span> elem a felhőben
                <div class="text-[9px] text-gray-400 mt-0.5">
                    ${Object.entries(stats).map(([table, count]) => `${table}: ${count}`).join(' | ')}
                </div>
            `;
            
            // Részletes lista
            let html = '<div class="space-y-1">';
            html += `<div class="font-bold text-blue-600">⬇️ Letöltendő adatok:</div>`;
            for (const [table, count] of Object.entries(stats)) {
                if (count > 0) {
                    html += `<div class="flex justify-between text-gray-700"><span>${table}</span><span class="font-bold">${count}</span></div>`;
                }
            }
            html += '</div>';
            details.innerHTML = html;
            
            // Szinkronizáció engedélyezése
            executeBtn.disabled = false;
            executeBtn.dataset.mode = 'pull';
            document.getElementById('syncLed').className = 'w-3 h-3 rounded-full bg-blue-500 animate-pulse';
            statusText.textContent = `${total} elem letöltése a felhőből`;
            
            // Függő változtatások ellenőrzése
            this._checkPendingChanges();
            
        } catch (e) {
            console.error(e);
            details.innerHTML = '<p class="text-red-500">Hiba történt az adatok lekérése során.</p>';
        } finally {
            pullBtn.disabled = false;
            pullBtn.innerHTML = `
                <div class="flex items-center gap-3">
                    <i class="fas fa-cloud-download-alt text-blue-600 text-xl"></i>
                    <div>
                        <h4 class="font-bold text-gray-800">Letöltés (Pull)</h4>
                        <p class="text-xs text-gray-500">Adatok lekérése a felhőből</p>
                    </div>
                </div>
            `;
        }
    };
    
    // Push adatok ellenőrzése
    pushBtn.onclick = async () => {
        pushBtn.disabled = true;
        pushBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Ellenőrzés...';
        details.innerHTML = '<p class="text-gray-400 italic">Helyi adatok ellenőrzése...</p>';
        
        try {
            const stats = await this.app.syncManager.getPushStats();
            const total = Object.values(stats).reduce((sum, v) => sum + v, 0);
            
            // Statisztika megjelenítése
            document.getElementById('pushStats').innerHTML = `
                <span class="font-bold text-emerald-600">${total}</span> elem helyben
                <div class="text-[9px] text-gray-400 mt-0.5">
                    ${Object.entries(stats).map(([table, count]) => `${table}: ${count}`).join(' | ')}
                </div>
            `;
            
            // Részletes lista
            let html = '<div class="space-y-1">';
            html += `<div class="font-bold text-emerald-600">⬆️ Feltöltendő adatok:</div>`;
            for (const [table, count] of Object.entries(stats)) {
                if (count > 0) {
                    html += `<div class="flex justify-between text-gray-700"><span>${table}</span><span class="font-bold">${count}</span></div>`;
                }
            }
            html += '</div>';
            details.innerHTML = html;
            
            // Szinkronizáció engedélyezése
            executeBtn.disabled = false;
            executeBtn.dataset.mode = 'push';
            document.getElementById('syncLed').className = 'w-3 h-3 rounded-full bg-emerald-500 animate-pulse';
            statusText.textContent = `${total} elem feltöltése a felhőbe`;
            
            // Függő változtatások ellenőrzése
            this._checkPendingChanges();
            
        } catch (e) {
            console.error(e);
            details.innerHTML = '<p class="text-red-500">Hiba történt a helyi adatok ellenőrzése során.</p>';
        } finally {
            pushBtn.disabled = false;
            pushBtn.innerHTML = `
                <div class="flex items-center gap-3">
                    <i class="fas fa-cloud-upload-alt text-emerald-600 text-xl"></i>
                    <div>
                        <h4 class="font-bold text-gray-800">Feltöltés (Push)</h4>
                        <p class="text-xs text-gray-500">Helyi adatok feltöltése a felhőbe</p>
                    </div>
                </div>
            `;
        }
    };
    
    // Szinkronizáció végrehajtása
    executeBtn.onclick = async () => {
        const mode = executeBtn.dataset.mode;
        if (!mode) return;
        
        executeBtn.disabled = true;
        executeBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Folyamatban...';
        statusText.textContent = mode === 'pull' ? 'Adatok letöltése...' : 'Adatok feltöltése...';
        document.getElementById('syncLed').className = 'w-3 h-3 rounded-full bg-amber-500 animate-pulse';
        
        try {
            if (mode === 'pull') {
                await this.app.syncManager.executePull();
            } else {
                await this.app.syncManager.executePush();
            }
            
            // Sikeres befejezés
            document.getElementById('syncLed').className = 'w-3 h-3 rounded-full bg-emerald-500';
            statusText.textContent = '✅ Szinkronizáció sikeresen befejeződött!';
            details.innerHTML = '<p class="text-emerald-600 font-bold">✅ A művelet sikeresen végrehajtódott.</p>';
            
            // UI frissítése
            this.app.renderer.renderTable();
            this.app.renderStats?.();
            this.app.remindersRenderer?.renderList?.();
            
            setTimeout(() => {
                modal.classList.add('hidden');
            }, 2000);
            
        } catch (e) {
            document.getElementById('syncLed').className = 'w-3 h-3 rounded-full bg-red-500';
            statusText.textContent = '❌ Hiba történt a szinkronizáció során!';
            details.innerHTML = `<p class="text-red-500">${e.message || 'Ismeretlen hiba'}</p>`;
            executeBtn.disabled = false;
            executeBtn.innerHTML = '<i class="fas fa-play"></i> Újrapróbálkozás';
        }
    };
    
    // Bezárás
    const closeModal = () => {
        modal.classList.add('hidden');
        executeBtn.disabled = true;
    };
    
    document.getElementById('btnCloseSyncModal').onclick = closeModal;
    document.getElementById('btnCancelSync').onclick = closeModal;
}

/**
 * Függő változtatások ellenőrzése
 */
_checkPendingChanges() {
    const container = document.getElementById('pendingChangesContainer');
    const list = document.getElementById('pendingChangesList');
    
    const hasPending = this.app.syncManager.hasPendingChanges();
    if (hasPending) {
        container.classList.remove('hidden');
        let html = '';
        for (const table in this.app.syncManager.pendingChanges) {
            const changes = this.app.syncManager.pendingChanges[table];
            if (changes.length > 0) {
                html += `<div class="flex justify-between text-amber-700"><span>${table}</span><span class="font-bold">${changes.length} függő</span></div>`;
                changes.forEach(c => {
                    html += `<div class="text-[9px] text-amber-600 ml-4">${c.operation}: ${JSON.stringify(c.data).substring(0, 40)}...</div>`;
                });
            }
        }
        list.innerHTML = html;
    } else {
        container.classList.add('hidden');
    }
}
}