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
            this.dataOps.forceSync();
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

        const confirmed = await this.app.hmiNotif.showConfirm(
            'KRITIKUS: Kategóriasor törlése',
            `Biztosan törölni szeretné a teljes "${itemName.toUpperCase()}" kategóriát az összes havi rész-tételével (${associatedEntries.length} db) együtt?`,
            true,
            'SOR TÖRLÉSE'
        );

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
}