// js/ui-controller.js - Teljes, eredeti alapú verzió + új funkciók
import { CellModalController } from './cell-modal-controller.js';
import { InputModalController } from './input-modal-controller.js';
import { DataSyncController } from './data-sync-controller.js';
import { DataExportController } from './data-export-controller.js';
import { DataMaintenanceController } from './data-maintenance-controller.js';

export class UIController {
    constructor(app) {
        this.app = app;

        // Új controllerek
        this.syncController = new DataSyncController(app);
        this.exportController = new DataExportController(app);
        this.maintenanceController = new DataMaintenanceController(app);

        // Meglévő controllerek
        this.cellModal = new CellModalController(app);
        this.inputModal = new InputModalController(app);
        
        // ===== ÚJ: SYNC QUEUE BADGE =====
        this.syncQueueBadge = null;
        this.syncQueueContainer = null;
        this._setupSyncQueueBadge();    
    }
    
        // ========================================================
    // === ÚJ: SYNC QUEUE BADGE ===
    // ========================================================
_setupSyncQueueBadge() {
    // Csak a meglévő elemeket keressük meg
    this.syncQueueContainer = document.getElementById('syncQueueContainer');
    this.syncQueueBadge = document.getElementById('syncQueueBadge');
    
    if (!this.syncQueueContainer || !this.syncQueueBadge) {
        console.warn('[UI] Queue badge elemek nem találhatók a DOM-ban');
        return;
    }
    
    // Kattintás esemény
    this.syncQueueContainer.addEventListener('click', () => {
        this._handleQueueClick();
    });
    
    // Regisztráljuk a queue változás figyelőt
    if (this.app.syncService?.onQueueChange) {
        this.app.syncService.onQueueChange((status) => {
            this._updateSyncQueueBadge(status);
        });
    }
    
    // Kezdeti állapot frissítés
    if (this.app.syncService) {
        const status = this.app.syncService.getQueueStatus();
        this._updateSyncQueueBadge(status);
    }
}
  
    _updateSyncQueueBadge(status) {
        if (!this.syncQueueBadge) return;
        
        const count = status?.pending || 0;
        const failed = status?.failed || 0;
        const total = status?.total || 0;
        
        if (total === 0) {
            this.syncQueueBadge.classList.add('hidden');
            this.syncQueueBadge.textContent = '0';
            this.syncQueueContainer?.setAttribute('title', 'Nincs függőben lévő művelet');
            return;
        }
        
        // Badge megjelenítése
        this.syncQueueBadge.classList.remove('hidden');
        this.syncQueueBadge.textContent = total > 99 ? '99+' : total;
        
        // Szín beállítása
        if (failed > 0) {
            this.syncQueueBadge.className = 'absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center animate-pulse';
            this.syncQueueContainer?.setAttribute('title', `${total} függő művelet (${failed} sikertelen)`);
        } else if (total > 0) {
            this.syncQueueBadge.className = 'absolute -top-1 -right-1 bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center';
            this.syncQueueContainer?.setAttribute('title', `${total} függőben lévő művelet`);
        }
    }

    _addTooltip(container) {
        // Tooltip div
        const tooltip = document.createElement('div');
        tooltip.className = 'sync-queue-tooltip hidden absolute right-0 top-full mt-2 bg-white rounded-2xl shadow-2xl p-4 min-w-[220px] z-50 border border-gray-100';
        tooltip.id = 'syncQueueTooltip';
        tooltip.innerHTML = `
            <div class="text-xs font-bold text-gray-700 mb-2">🔄 Függő műveletek</div>
            <div id="tooltipContent" class="text-xs text-gray-500">Nincs adat</div>
        `;
        container.appendChild(tooltip);
        
        // Hover események
        container.addEventListener('mouseenter', () => {
            tooltip.classList.remove('hidden');
            this._updateTooltipContent();
        });
        
        container.addEventListener('mouseleave', () => {
            tooltip.classList.add('hidden');
        });
    }

    _updateTooltipContent() {
        const content = document.getElementById('tooltipContent');
        if (!content) return;
        
        const status = this.app.syncService?.getQueueStatus();
        if (!status || status.total === 0) {
            content.innerHTML = '<span class="text-gray-400">Nincs függőben lévő művelet</span>';
            return;
        }
        
        let html = '';
        
        // Összesítés
        html += `<div class="flex justify-between text-gray-700 font-medium mb-1">
            <span>Összesen:</span>
            <span>${status.total}</span>
        </div>`;
        
        if (status.pending > 0) {
            html += `<div class="flex justify-between text-amber-600">
                <span>⏳ Függőben:</span>
                <span>${status.pending}</span>
            </div>`;
        }
        
        if (status.processing > 0) {
            html += `<div class="flex justify-between text-blue-600">
                <span>🔄 Folyamatban:</span>
                <span>${status.processing}</span>
            </div>`;
        }
        
        if (status.failed > 0) {
            html += `<div class="flex justify-between text-red-600">
                <span>❌ Sikertelen:</span>
                <span>${status.failed}</span>
            </div>`;
        }
        
        if (status.done > 0) {
            html += `<div class="flex justify-between text-emerald-600">
                <span>✅ Kész:</span>
                <span>${status.done}</span>
            </div>`;
        }
        
        // Részletes lista (max 3 elem)
        if (status.items && status.items.length > 0) {
            const pendingItems = status.items.filter(i => i.status === 'pending' || i.status === 'failed').slice(0, 3);
            if (pendingItems.length > 0) {
                html += `<div class="mt-2 pt-2 border-t border-gray-100 text-[10px] text-gray-500">`;
                pendingItems.forEach(item => {
                    const statusIcon = item.status === 'failed' ? '❌' : '⏳';
                    html += `<div class="flex justify-between py-0.5">
                        <span>${statusIcon} ${item.table}</span>
                        <span>${item.operation}</span>
                    </div>`;
                });
                if (status.items.length > 3) {
                    html += `<div class="text-gray-400 text-center mt-1">... és ${status.items.length - 3} további</div>`;
                }
                html += `</div>`;
            }
        }
        
        content.innerHTML = html;
    }

    _handleQueueClick() {
        const status = this.app.syncService?.getQueueStatus();
        if (!status || status.total === 0) {
            this.app.hmiNotif?.showToast('Nincs függőben lévő művelet', 'info');
            return;
        }
        
        // Részletes lista megjelenítése a sync modalban
        const modal = document.getElementById('syncModal');
        if (modal) {
            // Frissítjük a részletes listát
            const details = document.getElementById('syncDetails');
            if (details) {
                let html = '<div class="space-y-2">';
                html += `<div class="font-bold text-amber-700">🕐 ${status.total} függőben lévő művelet</div>`;
                
                // Csoportosítás táblánként
                const groups = {};
                status.items.forEach(item => {
                    if (item.status === 'pending' || item.status === 'failed') {
                        if (!groups[item.table]) groups[item.table] = [];
                        groups[item.table].push(item);
                    }
                });
                
                for (const [table, items] of Object.entries(groups)) {
                    html += `<div class="border-b border-gray-200 py-1">`;
                    html += `<div class="font-medium text-gray-700 text-xs">${table} (${items.length})</div>`;
                    items.slice(0, 5).forEach(item => {
                        const icon = item.status === 'failed' ? '❌' : '⏳';
                        const time = new Date(item.timestamp).toLocaleTimeString('hu-HU');
                        html += `<div class="flex justify-between text-[10px] text-gray-500 pl-2 py-0.5">
                            <span>${icon} ${item.operation}</span>
                            <span>${time}</span>
                            ${item.retryCount > 0 ? `<span class="text-amber-500">(${item.retryCount}x)</span>` : ''}
                        </div>`;
                    });
                    if (items.length > 5) {
                        html += `<div class="text-[10px] text-gray-400 pl-2">... és ${items.length - 5} további</div>`;
                    }
                    html += `</div>`;
                }
                
                html += `<div class="pt-2 text-xs text-gray-400">Kattints a "Szinkronizáció indítása" gombra a feldolgozáshoz</div>`;
                html += '</div>';
                details.innerHTML = html;
            }
            
            // Státusz frissítés
            const statusText = document.getElementById('syncStatusText');
            if (statusText) {
                statusText.textContent = `${status.total} függőben lévő művelet (${status.failed} sikertelen)`;
            }
            
            // Led frissítés
            const led = document.getElementById('syncLed');
            if (led) {
                led.className = status.failed > 0 ? 'w-3 h-3 rounded-full bg-red-500 animate-pulse' : 'w-3 h-3 rounded-full bg-amber-500 animate-pulse';
            }
            
            // Execute gomb engedélyezése
            const executeBtn = document.getElementById('btnExecuteSync');
            if (executeBtn) {
                executeBtn.disabled = false;
                executeBtn.dataset.mode = 'queue';
                executeBtn.innerHTML = '<i class="fas fa-play"></i> Queue feldolgozása';
            }
            
            modal.classList.remove('hidden');
        }
    }

    bindStaticEvents() {
        // ====================== FŐ GOMBOK ======================
        document.getElementById('btnNewItem')?.addEventListener('click', () => this.inputModal.open('item'));
        document.getElementById('btnNewMonth')?.addEventListener('click', () => this.inputModal.open('month'));
        document.getElementById('btnSettings')?.addEventListener('click', () => this.togglePanel('settingsPanel'));
        document.getElementById('btnDataControl')?.addEventListener('click', () => this.togglePanel('exportMenu'));

        // ====================== SZINKRONIZÁCIÓ ======================
        document.getElementById('btnForceSync')?.addEventListener('click', () => {
            this.togglePanel('exportMenu');
            this.openSyncModal();           // ← Eredeti metódus
        });

        // ====================== EXPORT GOMBOK ======================
        document.getElementById('btnExportExcel')?.addEventListener('click', () => {
            this.togglePanel('exportMenu');
            this.exportController.exportExcel();
        });

        document.getElementById('btnExportPdf')?.addEventListener('click', () => {
            this.togglePanel('exportMenu');
            this.exportController.exportPdf();
        });

        document.getElementById('btnExportJson')?.addEventListener('click', () => {
            this.togglePanel('exportMenu');
            this.exportController.exportJson();
        });

        document.getElementById('btnImportJson')?.addEventListener('click', () => {
            this.togglePanel('exportMenu');
            this.exportController.importJson();
        });

        // ====================== KARANTARTÁS ======================
        document.getElementById('btnForceBackup')?.addEventListener('click', () => {
            this.togglePanel('exportMenu');
            this.maintenanceController.performManualBackup();
        });

        document.getElementById('btnRestoreBackup')?.addEventListener('click', () => {
            this.togglePanel('exportMenu');
            this.maintenanceController.restoreFromBackup();
        });

        document.getElementById('btnWipeDatabase')?.addEventListener('click', async () => {
            this.togglePanel('exportMenu');
            await this.maintenanceController.wipeDatabase();
        });

        // ====================== DB AUDIT (ÚJ) ======================
        document.getElementById('btnDbAudit')?.addEventListener('click', () => {
            this.togglePanel('exportMenu');
            this.openDbAuditModal();
        });

        // ====================== INPUT ÉS CELL MODAL ======================
        document.getElementById('btnCancelInputModal')?.addEventListener('click', () => this.inputModal.close());
        document.getElementById('hmiInputSaveBtn')?.addEventListener('click', () => this.inputModal.save());

        document.getElementById('btnCancelCellModal')?.addEventListener('click', () => this.cellModal.close());
        document.getElementById('btnCloseCellModalX')?.addEventListener('click', () => this.cellModal.close());
        document.getElementById('btnSaveCellModal')?.addEventListener('click', () => this.cellModal.save());

        // Színválasztók a cell modalban
        document.querySelectorAll('.color-selector-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.color-selector-btn').forEach(b => b.classList.remove('ring-4', 'ring-black'));
                e.currentTarget.classList.add('ring-4', 'ring-black');
                this.cellModal.selectedColor = e.currentTarget.getAttribute('data-color');
            });
        });

        // Beállítások mentése
        document.getElementById('btnSaveSettings')?.addEventListener('click', async () => {
            await this._handleSettingsSave();
        });
        // === BEJÖVŐ UTALÁS GOMB ===
        document.getElementById('btnAddIncoming')?.addEventListener('click', () => {
        this.app.incomingRenderer?.addNewEntry?.();
        });
    }

    async _handleSettingsSave() {
        this.app.renderer.updateFooterStatus('Beállítások mentése...', false);
        try {
            const newUrl = document.getElementById('supabaseUrlInput')?.value?.trim() || '';
            const newKey = document.getElementById('supabaseKeyInput')?.value?.trim() || '';
            const newRate = Number(document.getElementById('eurRateInput')?.value || 400);
            const useCloud = document.getElementById('supabaseToggle')?.checked || false;

            if (this.app.config) {
                this.app.config.saveSettings({ url: newUrl, key: newKey, useCloud, eurRate: newRate });
            }

            this.app.hmiNotif?.showToast('Beállítások sikeresen rögzítve!', 'success');
            this.togglePanel('settingsPanel');
            this.app.renderer.renderTable();
            this.app.renderer.updateFooterStatus('Rendszer üzemkész - Árfolyam frissítve', false);
        } catch (err) {
            console.error('[SETTINGS SAVE ERR]', err);
            this.app.hmiNotif?.showToast('Hiba a mentés során!', 'error');
            this.app.renderer.updateFooterStatus('MENTÉSI HIBA!', true);
        }
    }

    togglePanel(id) {
        document.getElementById(id)?.classList.toggle('hidden');
    }

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
    }

    async handleRowDeleteSequence(itemIdStr, itemName) {
        const itemId = parseInt(itemIdStr);
        if (isNaN(itemId)) return;
        const allEntries = this.app.entries.entries;
        const associatedEntries = allEntries.filter(e => e.cellKey && e.cellKey.startsWith(`${itemId}_`));

        const confirmed = await this.app.hmiNotif.showConfirm({
           title: '⚠️ KRITIKUS: Kategóriasor törlése',
           message: `Biztosan törölni szeretné a teljes "\( {itemName.toUpperCase()}" kategóriát az összes havi rész-tételével ( \){associatedEntries.length} db) együtt?`,
          type: 'danger',
           confirmText: 'SOR TÖRLÉSE'
         });

        if (confirmed) {
            try {
                this.app.renderer.updateFooterStatus('Tranzakciók törlése...', false);
                for (const entry of associatedEntries) {
                    await this.app.entries.deleteEntry(entry.id).catch(e => console.warn('Entry már törölve:', entry.id));
                }
                await this.app.items.delete(itemId);

                await this.app.items.load().catch(() => {});
                await this.app.entries.load().catch(() => {});

                this.app.hmiNotif.showToast(`"${itemName}" sikeresen eltávolítva.`, 'success');
                this.app.renderer.updateFooterStatus('Sikeres fizikai törlés', false);
                this.app.renderer.renderTable();
                this.app.renderer.renderSummary();
            } catch (error) {
                console.error('[HMI PURGE CRITICAL ERROR]', error);
                this.app.hmiNotif.showToast('Kritikus hiba, de a felület frissítve!', 'error');
                this.app.renderer.updateFooterStatus('Törlési kényszerítés aktív', true);
                this.app.renderer.renderTable();
            }
        }
    }

    // ====================== DB AUDIT MODAL ======================
    openDbAuditModal() {
        const modal = document.getElementById('dbAuditModal');
        if (!modal) return;
        modal.classList.remove('hidden');
        this._runAuditAndShow();
    }

    async _runAuditAndShow() {
    const container = document.getElementById('auditReportContainer');
    if (!container) return;

    container.innerHTML = '<p class="text-center py-8 text-gray-400">Audit fut...</p>';

    const result = await this.app.dbAudit.runFullAudit();
    container.innerHTML = this.app.dbAudit.generateReportHTML();

    // Rebuild gomb
    document.getElementById('btnRebuildIndexes')?.addEventListener('click', async () => {
        const success = await this.app.dbAudit.rebuildIndexes();
        if (success) {
            setTimeout(() => this._runAuditAndShow(), 800);
        }
     });
    }

    // ====================== SYNC MODAL (TELJES EREDETI) ======================
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

    destroy() {
        // Queue badge eltávolítása
        this.syncQueueContainer?.remove();
        this.syncQueueBadge = null;
        this.syncQueueContainer = null;
        
        this.cellModal = null;
        this.inputModal = null;
        console.log('[UIController] Takarítva');
    }
}