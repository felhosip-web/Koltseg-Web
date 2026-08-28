// js/ui-controller.js - Teljes, eredeti alapú verzió + új funkciók
import { CellModalController } from './cell-modal-controller.js';
import { InputModalController } from './input-modal-controller.js';
import { DataSyncController } from './data-sync-controller.js';
import { DataExportController } from './data-export-controller.js';
import { DataMaintenanceController } from './data-maintenance-controller.js';

import { parseCellKey } from './utils/cell-key-utils.js';

export class UIController {
    /**
     * Konstruktor - UI Controller inicializálása
     * @param {Object} app - Az alkalmazás fő példánya
     */
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
        this.initAppearance();
    }
    
    // ========================================================
    // === ÚJ: SYNC QUEUE BADGE ===
    // ========================================================
    /**
     * Szinkronizálási várólista badge beállítása
     */
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
        if (this._unsubQueueChange) {
            this._unsubQueueChange();
        }
        this._unsubQueueChange = this.app.syncService.onQueueChange((status) => {
            this._updateSyncQueueBadge(status);
        });
    }
    
    // Kezdeti állapot frissítés
    if (this.app.syncService) {
        const status = this.app.syncService.getQueueStatus();
        this._updateSyncQueueBadge(status);
    }
}
  
    /**
     * Szinkronizálási várólista badge frissítése
     * @param {Object} status - A várólista státusza
     */
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

    /**
     * Tooltip hozzáadása a konténerhez
     * @param {HTMLElement} container - A konténer elem
     */
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

    /**
     * Tooltip tartalmának frissítése
     */
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
                html += `<div class="font-bold text-amber-700 flex justify-between items-center pb-1 border-b border-gray-100">
                    <span>🕐 ${status.total} függő művelet</span>
                    <button id="btnClearAllQueue" class="text-[10px] bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 px-2 py-0.5 rounded transition">
                        <i class="fas fa-trash-can"></i> Összes törlése
                    </button>
                </div>`;
                
                // Csoportosítás táblánként
                const groups = {};
                status.items.forEach(item => {
                    if (item.status === 'pending' || item.status === 'failed' || item.status === 'processing') {
                        if (!groups[item.table]) groups[item.table] = [];
                        groups[item.table].push(item);
                    }
                });
                
                for (const [table, items] of Object.entries(groups)) {
                    html += `<div class="border-b border-gray-150 py-1.5">`;
                    html += `<div class="font-semibold text-gray-700 text-[11px] mb-1">${table} (${items.length})</div>`;
                    items.forEach(item => {
                        const icon = item.status === 'failed' ? '❌' : '⏳';
                        const time = new Date(item.timestamp).toLocaleTimeString('hu-HU');
                        const opLabel = item.operation === 'delete' ? 'Törlés' : 'Mentés';
                        const opColor = item.operation === 'delete' ? 'text-red-500 font-bold' : 'text-emerald-600 font-bold';
                        const recordInfo = item.data && item.data.id ? `ID: ${item.data.id}` : '';
                        
                        html += `<div class="flex justify-between items-center text-[10px] text-gray-600 pl-2 pr-1 py-1 bg-white hover:bg-gray-100 rounded border border-gray-100 my-0.5">
                            <span class="flex items-center gap-1 truncate max-w-[60%]">
                                <span>${icon}</span>
                                <span class="${opColor}">${opLabel}</span>
                                <span class="text-gray-400 font-mono truncate">(${recordInfo})</span>
                            </span>
                            <div class="flex items-center gap-2 flex-shrink-0">
                                <span class="text-gray-400 font-mono text-[9px]">${time}</span>
                                ${item.retryCount > 0 ? `<span class="text-amber-500 font-bold">${item.retryCount}x</span>` : ''}
                                <button class="btn-delete-queue-item text-red-500 hover:text-red-700 hover:bg-red-50 p-1 rounded transition" data-id="${item.id}" title="Elem törlése">
                                    <i class="fas fa-times"></i>
                                </button>
                            </div>
                        </div>`;
                    });
                    html += `</div>`;
                }
                
                html += `<div class="pt-2 text-xs text-gray-400">Kattints a "Queue feldolgozása" gombra a végrehajtáshoz.</div>`;
                html += '</div>';
                details.innerHTML = html;

                // Eseménykezelők hozzáadása
                const clearAllBtn = details.querySelector('#btnClearAllQueue');
                if (clearAllBtn) {
                    clearAllBtn.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        const confirmed = await this.app.hmiNotif.showConfirm({
                            title: '🗑️ Várólista kiürítése',
                            message: 'Biztosan törölni szeretnéd az összes függőben lévő változtatást? Így a felhőbe nem fognak feltöltődni.',
                            confirmText: 'Igen, törlöm',
                            cancelText: 'Mégse'
                        });
                        if (confirmed) {
                            this.app.syncService.clearQueue();
                            this.app.hmiNotif.showToast('✅ Várólista sikeresen kiürítve!', 'success');
                            
                            const freshStatus = this.app.syncService.getQueueStatus();
                            if (freshStatus.total === 0) {
                                modal.classList.add('hidden');
                            } else {
                                this._handleQueueClick();
                            }
                            this._updateSyncQueueBadge(freshStatus);
                        }
                    });
                }

                details.querySelectorAll('.btn-delete-queue-item').forEach(btn => {
                    btn.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        const itemId = btn.getAttribute('data-id');
                        this.app.syncService.removeFromQueue(itemId);
                        this.app.hmiNotif.showToast('✅ Elem eltávolítva a várólistából', 'success');
                        
                        const freshStatus = this.app.syncService.getQueueStatus();
                        if (freshStatus.total === 0) {
                            modal.classList.add('hidden');
                        } else {
                            this._handleQueueClick();
                        }
                        this._updateSyncQueueBadge(freshStatus);
                    });
                });
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
        document.getElementById('btnAiMagic')?.addEventListener('click', () => this.app.aiModal?.open());
        document.getElementById('btnSettings')?.addEventListener('click', () => {
            this.populateSettingsForm();
            this.togglePanel('settingsPanel');
        });
        document.getElementById('btnSettingsWork')?.addEventListener('click', () => {
            this.populateSettingsForm();
            this.togglePanel('settingsPanel');
        });
        document.getElementById('btnCloseSettingsModal')?.addEventListener('click', () => {
            this.togglePanel('settingsPanel');
        });
        document.getElementById('settingsPanel')?.addEventListener('click', (e) => {
            if (e.target === e.currentTarget) {
                this.togglePanel('settingsPanel');
            }
        });
        document.getElementById('btnDataControl')?.addEventListener('click', () => this.togglePanel('exportMenu'));
        document.getElementById('btnDataControlWork')?.addEventListener('click', () => this.togglePanel('exportMenuWork'));
        document.getElementById('btnHelp')?.addEventListener('click', () => {
            this.app.hmiNotif?.openHelp?.();
        });
        document.getElementById('btnHelpWork')?.addEventListener('click', () => {
            this.app.hmiNotif?.openHelp?.('work_log');
        });
        document.getElementById('btnHelpInline')?.addEventListener('click', () => {
            this.app.hmiNotif?.openHelp?.();
        });

        // ====================== SZINKRONIZÁCIÓ ======================
        document.getElementById('btnForceSync')?.addEventListener('click', () => {
            this.togglePanel('exportMenu');
            this.openSyncModal();           // ← Eredeti metódus
        });
        document.getElementById('btnForceSyncWork')?.addEventListener('click', () => {
            this.togglePanel('exportMenuWork');
            this.openSyncModal();
        });

        const closeSyncModal = () => {
            const modal = document.getElementById('syncModal');
            if (modal) modal.classList.add('hidden');
            const executeBtn = document.getElementById('btnExecuteSync');
            if (executeBtn) executeBtn.disabled = true;
        };
        document.getElementById('btnCloseSyncModal')?.addEventListener('click', closeSyncModal);
        document.getElementById('btnCancelSync')?.addEventListener('click', closeSyncModal);

        // ====================== EXPORT GOMBOK ======================
        document.getElementById('btnExportExcel')?.addEventListener('click', () => {
            this.togglePanel('exportMenu');
            this.exportController.exportExcel();
        });
        document.getElementById('btnExportExcelWork')?.addEventListener('click', () => {
            this.togglePanel('exportMenuWork');
            this.exportController.exportWorkExcel();
        });

        document.getElementById('btnExportPdf')?.addEventListener('click', () => {
            this.togglePanel('exportMenu');
            this.exportController.exportPdf();
        });
        document.getElementById('btnExportPdfWork')?.addEventListener('click', () => {
            this.togglePanel('exportMenuWork');
            this.exportController.exportWorkPdf();
        });

        document.getElementById('btnExportJson')?.addEventListener('click', () => {
            this.togglePanel('exportMenu');
            this.exportController.exportJson();
        });
        document.getElementById('btnExportJsonWork')?.addEventListener('click', () => {
            this.togglePanel('exportMenuWork');
            this.exportController.exportWorkJson();
        });

        document.getElementById('btnImportJson')?.addEventListener('click', () => {
            this.togglePanel('exportMenu');
            this.exportController.importJson();
        });
        document.getElementById('btnImportJsonWork')?.addEventListener('click', () => {
            this.togglePanel('exportMenuWork');
            this.exportController.importWorkJson();
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
            if (this.app.securityGuard && this.app.securityGuard.currentUser === 'guest') {
                this.app.hmiNotif?.showToast('❌ Művelet elutasítva: Vendég (User 2) módban az adatbázis törlése le van tiltva!', 'error');
                return;
            }
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
                this.cellModal.selectedColor = e.currentTarget.getAttribute('data-color') || 'transparent';
            });
        });

        // Beállítások mentése
        
        // AI Settings
        document.getElementById('btnSaveAiSettings')?.addEventListener('click', () => {
            const aiApiKey = document.getElementById('aiApiKey').value.trim();
            const aiModel = document.getElementById('aiModel').value;
            
            this.app.config.aiConfig = {
                apiKey: aiApiKey,
                model: aiModel
            };
            
            localStorage.setItem('ai_api_key', aiApiKey);
            localStorage.setItem('ai_model', aiModel);
            localStorage.setItem('settings_updated_at', new Date().toISOString());
            
            this.app.hmiNotif?.showToast('AI beállítások mentve!', 'success');
        });

        document.getElementById('btnSaveSettings')?.addEventListener('click', async () => {
            await this._handleSettingsSave();
        });

        // Google Drive Client ID Mentés
        document.getElementById('btnSaveGDriveClientGeneral')?.addEventListener('click', () => {
            this._handleGoogleClientSave();
        });

        // Supabase Kapcsolat Tesztelése gomb
        document.getElementById('btnTestSupabaseConnSettings')?.addEventListener('click', () => {
            this._testSupabaseConnection();
        });

        // === BEJÖVŐ UTALÁS GOMB ===
        document.getElementById('btnAddIncoming')?.addEventListener('click', () => {
            this.app.incomingRenderer?.addNewEntry?.();
        });

        // === KITÖLTÖTTSÉG RÉSZLETEK BUBORÉK ===
        document.getElementById('btnFillDetails')?.addEventListener('click', (e) => {
            e.stopPropagation();
            const bubble = document.getElementById('fillDetailsBubble');
            if (bubble) {
                bubble.classList.toggle('hidden');
            }
        });
        document.getElementById('btnCloseFillDetails')?.addEventListener('click', (e) => {
            e.stopPropagation();
            const bubble = document.getElementById('fillDetailsBubble');
            if (bubble) {
                bubble.classList.add('hidden');
            }
        });
        document.addEventListener('click', (e) => {
            const bubble = document.getElementById('fillDetailsBubble');
            const btn = document.getElementById('btnFillDetails');
            if (bubble && !bubble.classList.contains('hidden')) {
                if (!bubble.contains(e.target) && e.target !== btn && !btn?.contains(e.target)) {
                    bubble.classList.add('hidden');
                }
            }
        });

        // ====================== BEÁLLÍTÁSOK BELSŐ TABS ======================
        const settingsTabButtons = document.querySelectorAll('.settings-tab-btn');
        const settingsTabContents = document.querySelectorAll('.settings-tab-content');
        
        settingsTabButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const targetTab = btn.getAttribute('data-settings-tab');
                
                // Gombok frissítése
                settingsTabButtons.forEach(b => {
                    b.classList.remove('bg-indigo-600', 'text-white', 'shadow-sm');
                    b.classList.add('bg-gray-100', 'text-gray-600', 'hover:bg-gray-200');
                });
                btn.classList.add('bg-indigo-600', 'text-white', 'shadow-sm');
                btn.classList.remove('bg-gray-100', 'text-gray-600', 'hover:bg-gray-200');
                
                // Tartalmak frissítése
                settingsTabContents.forEach(content => {
                    content.classList.add('hidden');
                    content.classList.remove('block');
                });
                
                let contentId = '';
                if (targetTab === 'general') contentId = 'settingsContentGeneral';
                else if (targetTab === 'templates') contentId = 'settingsContentTemplates';
                else if (targetTab === 'appearance') contentId = 'settingsContentAppearance';
                else if (targetTab === 'logs') {
                    contentId = 'settingsContentLogs';
                    this.renderLogs();
                } else if (targetTab === 'ai') {
                    contentId = 'settingsContentAi';
                } else if (targetTab === 'security') {
                    contentId = 'settingsContentSecurity';
                    if (this.app.securityGuard) {
                        this.app.securityGuard.populateForm();
                    }
                } else if (targetTab === 'modules') {
                    contentId = 'settingsContentModules';
                    if (this.app.moduleManager) {
                        this.app.moduleManager.renderModuleSettingsUI();
                    }
                }
                
                const targetContent = document.getElementById(contentId);
                if (targetContent) {
                    targetContent.classList.remove('hidden');
                    targetContent.classList.add('block');
                }
            });
        });

        // ====================== LOGS ESEMÉNYEK ======================
        document.getElementById('btnSaveLogs')?.addEventListener('click', () => {
            if (this.app.logger) {
                const text = this.app.logger.exportToText();
                const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `hmi_event_logs_${new Date().toISOString().slice(0,10)}.txt`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                this.app.logger.log('system', 'info', 'Eseménynapló exportálva/letöltve.');
            }
        });

        document.getElementById('btnClearLogs')?.addEventListener('click', async () => {
            if (this.app.logger) {
                const confirmed = await this.app.hmiNotif?.showConfirm?.({
                    title: 'Eseménynapló törlése',
                    message: 'Biztosan törölni szeretnéd az eseménynaplót?',
                    type: 'danger',
                    confirmText: 'Törlés',
                    cancelText: 'Mégse'
                });
                if (confirmed) {
                    this.app.logger.clear();
                    this.renderLogs();
                    this.app.hmiNotif?.showToast('Eseménynapló sikeresen törölve!', 'success');
                }
            }
        });

        // Click outside to close export menus
        document.addEventListener('click', (e) => {
            const dataControlBtn = document.getElementById('btnDataControl');
            const exportMenu = document.getElementById('exportMenu');
            if (exportMenu && !exportMenu.classList.contains('hidden')) {
                if (dataControlBtn && !dataControlBtn.contains(e.target) && !exportMenu.contains(e.target)) {
                    exportMenu.classList.add('hidden');
                }
            }

            const dataControlBtnWork = document.getElementById('btnDataControlWork');
            const exportMenuWork = document.getElementById('exportMenuWork');
            if (exportMenuWork && !exportMenuWork.classList.contains('hidden')) {
                if (dataControlBtnWork && !dataControlBtnWork.contains(e.target) && !exportMenuWork.contains(e.target)) {
                    exportMenuWork.classList.add('hidden');
                }
            }
        });
    }

    renderLogs() {
        const listContainer = document.getElementById('settingsLogsList');
        if (!listContainer || !this.app.logger) return;

        const logs = this.app.logger.getLogs();
        if (logs.length === 0) {
            listContainer.innerHTML = '<div class="text-center py-8 text-gray-400 italic">Nincsenek események rögzítve</div>';
            return;
        }

        listContainer.innerHTML = logs.map(log => {
            let badgeClass = 'bg-gray-100 text-gray-700';
            if (log.level === 'error') badgeClass = 'bg-red-100 text-red-700 font-bold';
            else if (log.level === 'warn') badgeClass = 'bg-amber-100 text-amber-700 font-bold';
            else if (log.level === 'success') badgeClass = 'bg-emerald-100 text-emerald-700 font-bold';
            else if (log.level === 'conflict') badgeClass = 'bg-indigo-100 text-indigo-700 font-bold border border-indigo-200';

            let categoryIcon = 'fa-info-circle';
            if (log.category === 'sync') categoryIcon = 'fa-sync';
            else if (log.category === 'db') categoryIcon = 'fa-database';
            else if (log.category === 'auth') categoryIcon = 'fa-user-shield';
            else if (log.category === 'reminder') categoryIcon = 'fa-clock';
            else if (log.category === 'conflict') categoryIcon = 'fa-code-branch';

            return `
                <div class="flex items-start gap-2.5 p-2 hover:bg-gray-100/60 rounded-xl transition-all border-b border-gray-100/50 last:border-b-0">
                    <span class="text-[10px] text-gray-400 font-mono select-none pt-0.5 shrink-0">${log.formattedTime}</span>
                    <span class="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${badgeClass} shrink-0 flex items-center gap-1">
                        <i class="fas ${categoryIcon}"></i> ${log.category}
                    </span>
                    <span class="text-xs text-gray-700 leading-normal break-all">${log.message}</span>
                </div>
            `;
        }).join('');
    }

    async _handleSettingsSave() {
        if (this.app.securityGuard && this.app.securityGuard.currentUser === 'guest') {
            this.app.hmiNotif?.showToast('❌ Módosítás elutasítva: Vendég (User 2) módban nem módosíthatóak az alapbeállítások!', 'error');
            this.app.renderer?.updateFooterStatus('Mentés elutasítva', true);
            return;
        }
        this.app.renderer.updateFooterStatus('Beállítások mentése...', false);
        console.log('[SETTINGS] _handleSettingsSave invoked');
        try {
            const newUrl = document.getElementById('supabaseUrlInput')?.value?.trim() || '';
            const newKey = document.getElementById('supabaseKeyInput')?.value?.trim() || '';
            const newRate = Number(document.getElementById('eurRateInput')?.value || 400);
            const useCloud = document.getElementById('supabaseToggle')?.checked || false;
            const useLiveEur = document.getElementById('useLiveEurToggle')?.checked ?? true;
            const weatherCity = document.getElementById('weatherCityInput')?.value?.trim() || 'Budapest';

            console.log('[SETTINGS] Collected values', { newUrl, hasKey: !!newKey, useCloud, newRate, useLiveEur, weatherCity });
            if (this.app.config) {
                const saved = this.app.config.saveSettings({ 
                    url: newUrl, 
                    key: newKey, 
                    useCloud: useCloud, 
                    eurRate: newRate,
                    useLiveEur: useLiveEur,
                    weatherCity: weatherCity
                });
                console.log('[SETTINGS] saveSettings ->', saved);
                console.log('[SETTINGS] Config after save', this.app.config.supabaseConfig, this.app.config.useSupabase, this.app.config.eurRate);
            }

            this.app.cloud?.init?.();
            this.app.syncService?.cloud?.init?.();
            
            // Ha kikapcsolták az online árfolyamot, akkor azonnal alkalmazzuk a mentett biztonsági árfolyamot
            if (!useLiveEur && this.app.config) {
                this.app.config.eurRate = newRate;
                this.app.renderer?.updateLed?.(newRate, 'fallback');
            } else if (this.app.config) {
                // Egyébként kérjük le azonnal az online árfolyamot
                await this.app.config.watchDogEur?.((rate, mode) => {
                    this.app.renderer?.updateLed?.(rate, mode);
                });
            }

            if (typeof this.app.updateOnlineStatus === 'function') {
                this.app.updateOnlineStatus(navigator.onLine);
            }

            localStorage.setItem('settings_updated_at', new Date().toISOString());
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

    populateSettingsForm() {
        if (!this.app.config) return;

        const urlEl = document.getElementById('supabaseUrlInput');
        const keyEl = document.getElementById('supabaseKeyInput');
        const rateEl = document.getElementById('eurRateInput');
        const toggleEl = document.getElementById('supabaseToggle');
        const liveEurEl = document.getElementById('useLiveEurToggle');

        if (urlEl) urlEl.value = this.app.config.supabaseConfig?.url || '';
        if (keyEl) keyEl.value = this.app.config.supabaseConfig?.key || '';
        if (rateEl) rateEl.value = String(this.app.config.defaultEurRate || this.app.config.eurRate || 400);
        if (toggleEl) toggleEl.checked = Boolean(this.app.config.useSupabase);
        if (liveEurEl) liveEurEl.checked = this.app.config.useLiveEur !== false;

        // Populate AI settings
        const aiApiKeyEl = document.getElementById('aiApiKey');
        const aiModelEl = document.getElementById('aiModel');
        const weatherCityEl = document.getElementById('weatherCityInput');
        if (aiApiKeyEl) aiApiKeyEl.value = this.app.config.aiConfig?.apiKey || '';
        if (aiModelEl) aiModelEl.value = this.app.config.aiConfig?.model || 'gemini-3.5-flash';
        if (weatherCityEl) weatherCityEl.value = this.app.config.weatherCity || 'Budapest';


        // Frissítsük a Google Bejelentkezés UI-t is
        this._updateGoogleAuthUI();

        // Modulok & Bővítmények felület frissítése
        if (this.app.moduleManager) {
            this.app.moduleManager.renderModuleSettingsUI();
        }
    }

    // ==================== GOOGLE DRIVE CLIENT ID METHODS ====================
    _handleGoogleClientSave() {
        const input = document.getElementById('gdriveClientIdGeneral');
        if (!input) return;
        
        const val = input.value.trim();
        if (!val) {
            this.app.hmiNotif?.showToast('A Client ID nem lehet üres!', 'warning');
            return;
        }
        
        localStorage.setItem('gdrive_client_id', val);
        this.app.hmiNotif?.showToast('Google Drive Client ID sikeresen mentve!', 'success');
        this._updateGoogleAuthUI();
    }

    _updateGoogleAuthUI() {
        const clientId = localStorage.getItem('gdrive_client_id');
        const badge = document.getElementById('googleStatusBadge');
        const input = document.getElementById('gdriveClientIdGeneral');
        
        if (input && clientId) {
            input.value = clientId;
        }
        
        if (badge) {
            if (clientId) {
                badge.textContent = 'Beállítva';
                badge.className = 'text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-600 uppercase';
            } else {
                badge.textContent = 'Nincs beállítva';
                badge.className = 'text-[9px] font-bold px-2 py-0.5 rounded-full bg-slate-200 text-slate-500 uppercase';
            }
        }

        if (this.app && typeof this.app.updateOnlineStatus === 'function') {
            this.app.updateOnlineStatus(navigator.onLine);
        }
    }

    async _testSupabaseConnection() {
        let url = document.getElementById('supabaseUrlInput')?.value?.trim();
        const key = document.getElementById('supabaseKeyInput')?.value?.trim();
        const btn = document.getElementById('btnTestSupabaseConnSettings');

        if (!url || !key) {
            this.app.hmiNotif?.showToast('Kérjük töltsd ki az URL és API kulcs mezőket!', 'warning');
            return;
        }

        // URL tisztítása és normalizálása
        if (url.endsWith('/')) {
            url = url.slice(0, -1);
        }
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            url = 'https://' + url;
        }

        const originalHTML = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Ellenőrzés...';

        try {
            console.log('[SUPABASE TEST] Kapcsolódás tesztelése a következő URL-lel:', url);
            
            let success = false;
            let warningText = '';

            // Próbáljuk meg először a hivatalos Supabase SDK segítségével, ha az létezik
            if (window.supabase) {
                try {
                    console.log('[SUPABASE TEST] Próbálkozás a Supabase JS SDK-val...');
                    const client = window.supabase.createClient(url, key, { auth: { persistSession: false } });
                    
                    // Próbáljunk lekérdezni egy meglévő táblát (pl. months vagy entries)
                    const { data, error } = await client.from('months').select('month').limit(1);
                    
                    if (!error) {
                        console.log('[SUPABASE TEST] SDK lekérdezés sikeres!');
                        success = true;
                    } else {
                        console.warn('[SUPABASE TEST] SDK hiba válasz:', error);
                        
                        // Speciális státuszkódok lekezelése
                        if (error.status === 401 || error.status === 403) {
                            throw new Error(`Hitelesítési hiba: ${error.message || 'Helytelen API kulcs!'}`);
                        } else if (error.code === '42P01') {
                            // A tábla nem létezik, de a kapcsolat és hitelesítés teljesen jó!
                            console.log('[SUPABASE TEST] A táblák nincsenek létrehozva, de a hitelesítés és a kapcsolat jó.');
                            success = true;
                            warningText = 'Kapcsolat rendben, de az SQL sémát még be kell másolni a Supabase-be!';
                        } else if (error.status === 404) {
                            // 404 vagy más schema hiba is jelezheti, hogy maga a kiszolgáló válaszol, csak a tábla/schema rossz
                            console.log('[SUPABASE TEST] Kapcsolat jó (404-es válasz a months táblára).');
                            success = true;
                            warningText = 'Kapcsolat rendben, de a táblák még hiányoznak!';
                        } else {
                            // Ha valamilyen más hiba van, amit nem ismerünk, próbáljuk meg a közvetlen fetch hívást is fallback-ként
                            console.log('[SUPABASE TEST] Egyéb SDK hiba, átváltás fetch-re...');
                        }
                    }
                } catch (sdkErr) {
                    console.warn('[SUPABASE TEST] SDK hiba:', sdkErr.message);
                    if (sdkErr.message.includes('Hitelesítési hiba')) {
                        throw sdkErr;
                    }
                }
            }

            // Ha az SDK nem volt elérhető, vagy az SDK teszt bizonytalan eredményt adott, de nem dobott auth hibát
            if (!success) {
                console.log('[SUPABASE TEST] Próbálkozás közvetlen fetch-csel...');
                const response = await fetch(`${url}/rest/v1/`, {
                    method: 'GET',
                    headers: {
                        'apikey': key,
                        'Authorization': `Bearer ${key}`
                    }
                });

                if (response.ok) {
                    console.log('[SUPABASE TEST] Közvetlen fetch sikeres!');
                    success = true;
                } else if (response.status === 401 || response.status === 403) {
                    throw new Error(`Hitelesítési hiba (HTTP ${response.status})`);
                } else {
                    throw new Error(`Szerver válasz kód: ${response.status}`);
                }
            }

            if (success) {
                if (warningText) {
                    this.app.hmiNotif?.showToast(warningText, 'warning', 5000);
                    btn.className = "flex-1 px-4 py-2 bg-amber-500 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2";
                    btn.innerHTML = '<i class="fas fa-exclamation-circle"></i> Kapcsolat Jó (Séma hiány)';
                } else {
                    this.app.hmiNotif?.showToast('Sikeres kapcsolat a Supabase szerverrel!', 'success');
                    btn.className = "flex-1 px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2";
                    btn.innerHTML = '<i class="fas fa-check-circle"></i> Kapcsolat Rendben';
                }
            } else {
                throw new Error('Nem sikerült kapcsolatot létesíteni.');
            }

        } catch (err) {
            console.error('[SUPABASE TEST ERR]', err);
            const errMsg = err.message || '';
            let toastMsg = 'Kapcsolódási hiba: Ellenőrizd a Supabase adatokat!';
            if (errMsg.includes('Hitelesítési hiba') || errMsg.includes('401') || errMsg.includes('403')) {
                toastMsg = 'Hitelesítési hiba: Érvénytelen Anon API kulcs!';
            } else if (errMsg.includes('Failed to fetch') || errMsg.includes('network')) {
                toastMsg = 'Hálózati hiba: A Supabase szerver nem érhető el (CORS vagy hibás URL)!';
            }
            
            this.app.hmiNotif?.showToast(toastMsg, 'error', 4000);
            btn.className = "flex-1 px-4 py-2 bg-rose-600 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2";
            btn.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Sikertelen Kapcsolat';
        } finally {
            setTimeout(() => {
                btn.disabled = false;
                btn.className = "flex-1 px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2";
                btn.innerHTML = originalHTML;
            }, 3000);
        }
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
        const itemId = itemIdStr;
        if (!itemId) return;
        const allEntries = this.app.entries.entries;
        const associatedEntries = allEntries.filter(e => parseCellKey(e).itemId === itemId);

        let confirmed = false;
        try {
            confirmed = await this.app.hmiNotif.showConfirm({
               title: '⚠️ KRITIKUS: Kategóriasor törlése',
               message: `Biztosan törölni szeretné a teljes "${itemName.toUpperCase()}" kategóriát az összes havi rész-tételével (${associatedEntries.length} db) együtt?`,
              type: 'danger',
               confirmText: 'SOR TÖRLÉSE'
             });
        } catch (err) {
            console.error('[HMI PURGE ERROR] Modal hiba:', err);
            this.app.renderer.updateFooterStatus('Hiba a megerősítő ablaknál', true);
            return;
        }

        if (confirmed) {
            try {
                this.app.renderer.updateFooterStatus('Tranzakciók törlése...', false);
                for (const entry of associatedEntries) {
                    await this.app.entries.deleteEntry(entry.id).catch(e => console.warn('Entry már törölve:', entry.id));
                }
                await this.app.items.delete(itemId);

                await this.app.items.load().catch(() => {});
                await this.app.entries.load().catch(() => {});

                window.dispatchEvent(new Event('app-data-updated'));
                this.app.hmiNotif.showToast(`"${itemName}" sikeresen eltávolítva.`, 'success');
                this.app.renderer.updateFooterStatus('Sikeres fizikai törlés', false);
            } catch (error) {
                console.error('[HMI PURGE CRITICAL ERROR]', error);
                this.app.hmiNotif.showToast('Hiba törlés közben.', 'error');
                this.app.renderer.updateFooterStatus('Törlési hiba', true);
            } finally {
                if (typeof this.app.renderer.renderSummary === 'function') {
                    this.app.renderer.renderSummary();
                }
            }
        }
    }

    async handleMonthDeleteSequence(month) {
        if (!month) return;
        const allEntries = this.app.entries.entries;
        const associatedEntries = allEntries.filter(e => {
            return parseCellKey(e).month === month;
        });

        const confirmed = await this.app.hmiNotif.showConfirm({
            title: '⚠️ KRITIKUS: Hónap lezárása / törlése',
            message: `Biztosan törölni szeretné a(z) "${month}" hónapot az összes benne lévő rész-tételével (${associatedEntries.length} db) együtt?`,
            type: 'danger',
            confirmText: 'HÓNAP TÖRLÉSE'
        });

        if (confirmed) {
            try {
                this.app.renderer.updateFooterStatus('Havi tranzakciók törlése...', false);
                for (const entry of associatedEntries) {
                    await this.app.entries.deleteEntry(entry.id).catch(e => console.warn('Entry már törölve:', entry.id));
                }
                await this.app.months.delete(month);

                await this.app.months.load().catch(() => {});
                await this.app.entries.load().catch(() => {});

                window.dispatchEvent(new Event('app-data-updated'));
                this.app.hmiNotif.showToast(`"${month}" hónap sikeresen eltávolítva.`, 'success');
                this.app.renderer.updateFooterStatus('Sikeres fizikai törlés', false);
            } catch (error) {
                console.error('[HMI PURGE MONTH CRITICAL ERROR]', error);
                this.app.hmiNotif.showToast('Hiba a hónap törlésekor.', 'error');
                this.app.renderer.updateFooterStatus('Törlési hiba', true);
            } finally {
                if (typeof this.app.refreshAllTabs === 'function') {
                    this.app.refreshAllTabs();
                }
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
        const rebuildBtn = document.getElementById('btnRebuildIndexes');
        if (rebuildBtn) {
            rebuildBtn.onclick = async () => {
                rebuildBtn.disabled = true;
                const success = await this.app.dbAudit.rebuildIndexes();
                rebuildBtn.disabled = false;
                if (success) {
                    setTimeout(() => this._runAuditAndShow(), 800);
                }
            };
        }

        // Auto Repair gomb
        const repairBtn = document.getElementById('btnAutoRepairDb');
        if (repairBtn) {
            repairBtn.onclick = async () => {
                repairBtn.disabled = true;
                repairBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Gyógyítás folyamatban...';
                
                const repairRes = await this.app.dbAudit.autoRepairDatabase();
                
                repairBtn.disabled = false;
                repairBtn.innerHTML = '<i class="fas fa-magic"></i> Adatbázis Gyógyítása';
                
                if (repairRes.status === 'ok') {
                    this.app.hmiNotif?.showNotification?.('Sikeres gyógyítás!', repairRes.message, 'success');
                    this.app.renderer?.renderTable?.();
                    if (this.app.incomingRenderer) this.app.incomingRenderer.render();
                    
                    setTimeout(() => this._runAuditAndShow(), 1200);
                } else {
                    this.app.hmiNotif?.showNotification?.('Hiba történt', repairRes.message, 'error');
                }
            };
        }

        // Deep Test Suite gomb
        const runTestsBtn = document.getElementById('btnRunDeepTests');
        if (runTestsBtn) {
            runTestsBtn.onclick = async () => {
                runTestsBtn.disabled = true;
                runTestsBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Tesztelés fut...';
                
                await this.app.dbAudit.runDeepTestSuite();
                
                runTestsBtn.disabled = false;
                runTestsBtn.innerHTML = '<i class="fas fa-vial"></i> Mély Teszt Suite Futtatása';
                
                this._runAuditAndShow();
            };
        }
    }

    // ====================== SYNC MODAL (TELJES EREDETI) ======================
    openSyncModal() {
        const modal = document.getElementById('syncModal');
        if (!modal) return;
        if (!this.app.syncManager) {
            this.app.hmiNotif?.showToast('Szinkronizáció nem elérhető', 'warning');
            return;
        }

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

    // Kezdeti állapotok beállítása, hogy ne "Ellenőrzés..." legyen látható üresen
    const pStats = document.getElementById('pullStats');
    if (pStats) {
        pStats.innerHTML = '<span class="text-gray-400 italic">Kattints az ellenőrzéshez</span>';
    }
    const puStats = document.getElementById('pushStats');
    if (puStats) {
        puStats.innerHTML = '<span class="text-gray-400 italic">Kattints az ellenőrzéshez</span>';
    }

    // Ha nincsenek táblák a Supabase-ben, jelezzük kiemelten
    if (this.app.syncService?.cloud?.tablesMissing) {
        statusText.textContent = '⚠️ HIÁNYZÓ TÁBLÁK A SUPABASE-BEN!';
        document.getElementById('syncLed').className = 'w-3 h-3 rounded-full bg-red-500 animate-pulse';
        details.innerHTML = `
            <div class="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 space-y-2">
                <p class="font-bold text-xs flex items-center gap-1">
                    <i class="fas fa-exclamation-triangle"></i> A Supabase táblák nem találhatók!
                </p>
                <p class="text-[10px] leading-relaxed">
                    A felhőben nincsenek létrehozva a szükséges táblák (vagy nemrég törölted őket). Kérlek, másold ki a sémát és futtasd le a Supabase SQL Editor-jában!
                </p>
                <div class="mt-2 flex gap-2">
                    <button id="btnCopySchemaModal" class="px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white rounded-lg text-[10px] font-bold transition flex items-center gap-1">
                        <i class="fas fa-copy"></i> SQL Séma Másolása
                    </button>
                    <button id="btnGoToDev" class="px-2.5 py-1 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg text-[10px] font-bold transition flex items-center gap-1">
                        <i class="fas fa-plug"></i> Diagnosztika
                    </button>
                </div>
            </div>
        `;

        // Eseménykezelők hozzáadása a figyelmeztetés gombjaihoz
        setTimeout(() => {
            const btnCopy = document.getElementById('btnCopySchemaModal');
            if (btnCopy) {
                btnCopy.onclick = (e) => {
                    e.stopPropagation();
                    const sqlText = typeof window.getSupabaseSQLScript === 'function' ? window.getSupabaseSQLScript() : '';
                    if (sqlText) {
                        navigator.clipboard.writeText(sqlText);
                        this.app.hmiNotif?.showToast('SQL séma másolva a vágólapra!', 'success');
                    } else {
                        const debugSql = document.getElementById('debugSupabaseSQL');
                        if (debugSql) {
                            navigator.clipboard.writeText(debugSql.value);
                            this.app.hmiNotif?.showToast('SQL séma másolva a vágólapra!', 'success');
                        }
                    }
                };
            }
            const btnGo = document.getElementById('btnGoToDev');
            if (btnGo) {
                btnGo.onclick = (e) => {
                    e.stopPropagation();
                    modal.classList.add('hidden');
                    const devCard = document.getElementById('devManagerCard');
                    if (devCard) {
                        devCard.scrollIntoView({ behavior: 'smooth' });
                    }
                };
            }
        }, 50);
    } else {
        details.innerHTML = '<p class="text-gray-400 italic">Kattints a "Letöltés" vagy "Feltöltés" gombra az adatok ellenőrzéséhez.</p>';
    }
    
    // Pull adatok ellenőrzése
    pullBtn.onclick = async () => {
        pullBtn.disabled = true;
        pullBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Ellenőrzés...';
        details.innerHTML = '<p class="text-gray-400 italic">Adatok lekérése...</p>';
        
        try {
            const stats = await this.app.syncManager.getPullStats();
            const total = Object.values(stats).reduce((sum, v) => sum + v, 0);
            
            // Statisztika megjelenítése
            const pullStatsEl = document.getElementById('pullStats');
            if (pullStatsEl) {
                pullStatsEl.innerHTML = `
                    <span class="font-bold text-blue-600">${total}</span> elem a felhőben
                    <div class="text-[9px] text-gray-400 mt-0.5">
                        ${Object.entries(stats).map(([table, count]) => `${table}: ${count}`).join(' | ')}
                    </div>
                `;
            }
            
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
                <div id="pullStats" class="mt-2 text-xs text-gray-600">${document.getElementById('pullStats')?.innerHTML || '<span class="text-gray-400 italic">Kattints az ellenőrzéshez</span>'}</div>
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
            const pushStatsEl = document.getElementById('pushStats');
            if (pushStatsEl) {
                pushStatsEl.innerHTML = `
                    <span class="font-bold text-emerald-600">${total}</span> elem helyben
                    <div class="text-[9px] text-gray-400 mt-0.5">
                        ${Object.entries(stats).map(([table, count]) => `${table}: ${count}`).join(' | ')}
                    </div>
                `;
            }
            
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
                <div id="pushStats" class="mt-2 text-xs text-gray-600">${document.getElementById('pushStats')?.innerHTML || '<span class="text-gray-400 italic">Kattints az ellenőrzéshez</span>'}</div>
            `;
        }
    };
    
    // Szinkronizáció végrehajtása
    executeBtn.onclick = async () => {
        const mode = executeBtn.dataset.mode;
        if (!mode) return;
        
        executeBtn.disabled = true;
        executeBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Folyamatban...';
        
        if (mode === 'pull') {
            statusText.textContent = 'Adatok letöltése...';
        } else if (mode === 'queue') {
            statusText.textContent = 'Várólista feldolgozása...';
        } else {
            statusText.textContent = 'Adatok feltöltése...';
        }
        document.getElementById('syncLed').className = 'w-3 h-3 rounded-full bg-amber-500 animate-pulse';
        
        try {
            if (mode === 'pull') {
                await this.app.syncManager.executePull();
            } else if (mode === 'queue') {
                const qResult = await this.app.syncManager.processQueue();
                details.innerHTML = `<p class="text-emerald-600 font-bold">✅ Sikerült feldolgozni ${qResult.processed} műveletet.</p>${qResult.failed > 0 ? `<p class="text-red-500 font-bold">⚠️ ${qResult.failed} művelet sikertelen.</p>` : ''}`;
            } else {
                await this.app.syncManager.executePush();
            }
            
            // Sikeres befejezés
            document.getElementById('syncLed').className = 'w-3 h-3 rounded-full bg-emerald-500';
            statusText.textContent = '✅ Szinkronizáció sikeresen befejeződött!';
            if (mode !== 'queue') {
                details.innerHTML = '<p class="text-emerald-600 font-bold">✅ A művelet sikeresen végrehajtódott.</p>';
            }
            
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
        if (!container || !list) return;

        const hasPending = this.app.syncManager?.hasPendingChanges?.() || false;
        const detailsData = this.app.syncManager?.getPendingDetails?.() || {};

        if (hasPending && Object.keys(detailsData).length > 0) {
            container.classList.remove('hidden');
            let html = '';
            for (const [table, changes] of Object.entries(detailsData)) {
                if (!changes || changes.length === 0) continue;
                html += `<div class="flex justify-between text-amber-700"><span>${table}</span><span class="font-bold">${changes.length} függő</span></div>`;
                changes.forEach(c => {
                    html += `<div class="text-[9px] text-amber-600 ml-4">${c.operation}: ${new Date(c.timestamp).toLocaleString('hu-HU')}</div>`;
                });
            }
            list.innerHTML = html;
        } else {
            container.classList.add('hidden');
            list.innerHTML = '';
        }
    }

    initAppearance() {
        const darkModeToggle = document.getElementById('darkModeToggle');
        const darkModeStatusText = document.getElementById('darkModeStatusText');
        const btnResetAppearance = document.getElementById('btnResetAppearance');
        const themeBgButtons = document.querySelectorAll('#themeBgSelectorContainer [data-bg-theme]');

        // 1. Betöltés localStorage-ból indításkor
        const savedDarkMode = localStorage.getItem('appearance_dark_mode') === 'true';
        const savedBgTheme = localStorage.getItem('appearance_bg_theme') || 'white';

        // Alkalmazás indításkor
        this.applyDarkMode(savedDarkMode);
        this.applyBgTheme(savedBgTheme);

        // UI elemek beállítása
        if (darkModeToggle) {
            darkModeToggle.checked = savedDarkMode;
            darkModeToggle.addEventListener('change', (e) => {
                const isDark = e.target.checked;
                this.applyDarkMode(isDark);
                localStorage.setItem('appearance_dark_mode', String(isDark)); localStorage.setItem('settings_updated_at', new Date().toISOString());
                this.app.logger?.log('Megjelenés', `Sötét mód ${isDark ? 'bekapcsolva' : 'kikapcsolva'}`);
            });
        }

        themeBgButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const theme = btn.getAttribute('data-bg-theme');
                this.applyBgTheme(theme);
                localStorage.setItem('appearance_bg_theme', theme); localStorage.setItem('settings_updated_at', new Date().toISOString());
                this.updateBgThemeSelectorUI(theme);
                this.app.logger?.log('Megjelenés', `Háttér téma módosítva: ${theme}`);
            });
        });

        if (btnResetAppearance) {
            btnResetAppearance.addEventListener('click', () => {
                this.applyDarkMode(false);
                this.applyBgTheme('white');
                localStorage.setItem('appearance_dark_mode', 'false'); localStorage.setItem('settings_updated_at', new Date().toISOString());
                localStorage.setItem('appearance_bg_theme', 'white'); localStorage.setItem('settings_updated_at', new Date().toISOString());
                if (darkModeToggle) darkModeToggle.checked = false;
                this.updateBgThemeSelectorUI('white');
                this.app.hmiNotif?.showToast('Megjelenés visszaállítva alapértelmezettre!', 'info');
                this.app.logger?.log('Megjelenés', 'Visszaállítás alapértelmezett beállításokra');
            });
        }

        // Kezdeti gombállapot frissítés
        this.updateBgThemeSelectorUI(savedBgTheme);
    }

    applyDarkMode(isDark) {
        const body = document.body;
        const statusText = document.getElementById('darkModeStatusText');
        if (isDark) {
            body.classList.add('dark-mode');
            if (statusText) statusText.textContent = 'Aktív állapot: Bekapcsolva (Sötét mód)';
        } else {
            body.classList.remove('dark-mode');
            if (statusText) statusText.textContent = 'Aktív állapot: Kikapcsolva (Világos mód)';
        }
    }

    applyBgTheme(theme) {
        const body = document.body;
        
        // Eltávolítjuk a meglévő témákat
        body.classList.remove('bg-theme-cream', 'bg-theme-sage', 'bg-theme-ice', 'bg-theme-lavender', 'bg-theme-slate', 'bg-theme-emerald-slate', 'theme-custom-bg');
        
        if (theme !== 'white') {
            body.classList.add('theme-custom-bg');
            body.classList.add(`bg-theme-${theme}`);
        }

        // Ha az emerald-slate van kiválasztva, kényszerítsük a sötét módot, különben állítsuk be a bejelöltnek megfelelően
        if (theme === 'emerald-slate') {
            body.classList.add('dark-mode');
        } else {
            const savedDarkMode = localStorage.getItem('appearance_dark_mode') === 'true';
            if (savedDarkMode) {
                body.classList.add('dark-mode');
            } else {
                body.classList.remove('dark-mode');
            }
        }
    }

    updateBgThemeSelectorUI(selectedTheme) {
        const themeBgButtons = document.querySelectorAll('#themeBgSelectorContainer [data-bg-theme]');
        themeBgButtons.forEach(btn => {
            const theme = btn.getAttribute('data-bg-theme');
            const checkIcon = btn.querySelector('.check-icon');
            if (theme === selectedTheme) {
                btn.classList.add('border-indigo-600');
                btn.classList.remove('border-gray-200');
                checkIcon?.classList.remove('hidden');
            } else {
                btn.classList.remove('border-indigo-600');
                btn.classList.add('border-gray-200');
                checkIcon?.classList.add('hidden');
            }
        });
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
