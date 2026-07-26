// js/virtual-table-renderer.js
// Virtual Table Renderer - Teljesítményoptimalizált virtuális táblázat
// JAVÍTOTT VERZIÓ: renderTable() alias hozzáadva
import { CategoryIcons } from './category-icons.js';

export class VirtualTableRenderer {
    constructor(app) {
        this.app = app;
        
        this.wrapper = null;
        this.tbody = null;
        this.rowHeight = 53;
        this.visibleRows = 28;
        this.buffer = 12;
        this.loadedMonths = 15;
        this.monthsPerLoad = 8;
        
        this.isRendering = false;
        this._rafId = null;
        this.scrollTop = 0;

        this.lastRenderedStartIdx = -1;
        this.lastRenderedLoadedMonths = -1;
    }

    // ================================================================
    // === FŐ RENDER METÓDUSOK ===
    // ================================================================

    /**
     * Fő render metódus (eredeti név)
     */
    render() {
        const items = this.app.items?.items || [];
        const months = this.app.months?.months || [];
        const entries = this.app.entries?.entries || [];

        console.log('[VTABLE] render() called — items:', items.length, 'months:', months.length, 'entries:', entries.length);

        if (items.length === 0 || months.length === 0) {
            this._showEmptyState();
            return;
        }

        const currMonth = new Date().toISOString().substring(0, 7);
        const currMonthIdx = months.indexOf(currMonth);
        if (currMonthIdx >= 0 && currMonthIdx >= this.loadedMonths) {
            this.loadedMonths = currMonthIdx + 1;
        }

        this._initContainer();
        this._renderHeader(months);
        this._renderVisibleRows(items, months, entries, true);
        this._attachScrollHandlers(items, months, entries);
        this._attachCellEvents();
    }

    /**
     * ALIAS: renderTable() – kompatibilitás az app.js-vel
     */
    renderTable() {
        return this.render();
    }

    /**
     * Compatibility method for legacy UI controller calls.
     */
    renderSummary() {
        return this.render();
    }

    // ================================================================
    // === KONTAINER INICIALIZÁLÁS ===
    // ================================================================

    _initContainer() {
        const container = document.getElementById('mainTableContainer');
        if (!container) {
            console.warn('[VTABLE] mainTableContainer not found');
            return;
        }

        container.innerHTML = `
            <div id="vtWrapper" class="overflow-auto rounded-3xl border border-gray-200 bg-white shadow-sm relative" 
                 style="max-height: 76vh; contain: layout paint;">
                <table class="w-full border-collapse text-sm" id="vtTable">
                    <thead id="vtThead" class="bg-gray-50 sticky top-0 z-20"></thead>
                    <tbody id="vtTbody"></tbody>
                </table>
            </div>`;

        this.wrapper = document.getElementById('vtWrapper');
        this.tbody = document.getElementById('vtTbody');
    }

    // ================================================================
    // === HEADER RENDER ===
    // ================================================================

    _renderHeader(months) {
        const thead = document.getElementById('vtThead');
        let html = `<tr>
            <th class="px-6 py-4 font-black text-gray-700 bg-gray-100 md:sticky md:left-0 z-10 md:z-30 min-w-[100px] w-[1%] whitespace-nowrap text-left">Kategória</th>`;

        const visibleMonths = months.slice(0, this.loadedMonths);
        visibleMonths.forEach(m => {
            html += `<th class="px-4 py-4 text-center border-l border-gray-200 min-w-[160px] whitespace-nowrap dblclick-month-purge cursor-pointer hover:bg-red-50/80 transition-colors" data-month="${m}">${m}</th>`;
        });
        html += `</tr>`;
        thead.innerHTML = html;
        this._attachHeaderEvents();
    }

    _attachHeaderEvents() {
        const thead = document.getElementById('vtThead');
        if (!thead) return;

        thead.querySelectorAll('.dblclick-month-purge').forEach(el => {
            el.addEventListener('dblclick', (e) => {
                this.app.uiController.handleMonthDeleteSequence(el.dataset.month);
            });

            // Hosszú nyomás (longpress) eseménykezelő a hónap törléshez
            let pressTimer = null;
            let isLongPressTriggered = false;
            let startX = 0;
            let startY = 0;

            const startPress = (e) => {
                isLongPressTriggered = false;
                if (e.touches && e.touches[0]) {
                    startX = e.touches[0].clientX;
                    startY = e.touches[0].clientY;
                } else {
                    startX = e.clientX;
                    startY = e.clientY;
                }

                if (pressTimer) clearTimeout(pressTimer);
                pressTimer = setTimeout(async () => {
                    isLongPressTriggered = true;
                    el.classList.add('bg-rose-100');
                    
                    try {
                        await this.app.uiController.handleMonthDeleteSequence(el.dataset.month);
                        el.classList.remove('bg-rose-100');
                    } catch (err) {
                        console.error('[LongPress Month] Hiba:', err);
                        el.classList.remove('bg-rose-100');
                    }
                }, 600);
            };

            const cancelPress = () => {
                if (pressTimer) {
                    clearTimeout(pressTimer);
                    pressTimer = null;
                }
                el.classList.remove('bg-rose-100');
            };

            const movePress = (e) => {
                let currentX = 0, currentY = 0;
                if (e.touches && e.touches[0]) {
                    currentX = e.touches[0].clientX;
                    currentY = e.touches[0].clientY;
                } else {
                    currentX = e.clientX;
                    currentY = e.clientY;
                }
                if (Math.abs(currentX - startX) > 10 || Math.abs(currentY - startY) > 10) {
                    cancelPress();
                }
            };

            el.addEventListener('mousedown', startPress);
            el.addEventListener('mouseup', cancelPress);
            el.addEventListener('mouseleave', cancelPress);
            el.addEventListener('mousemove', movePress);

            el.addEventListener('touchstart', startPress, { passive: true });
            el.addEventListener('touchend', (e) => {
                cancelPress();
                if (isLongPressTriggered) e.preventDefault();
            });
            el.addEventListener('touchmove', movePress, { passive: true });
            el.addEventListener('touchcancel', cancelPress);
        });
    }
    
// 2. RÉSZ: Sorok render, Események, Segédfüggvények, Destroy

    // ================================================================
    // === SOROK RENDER ===
    // ================================================================

    _renderVisibleRows(items, months, entries, force = false) {
        if (!this.tbody || !this.wrapper) return;

        const startIdx = Math.max(0, Math.floor(this.wrapper.scrollTop / this.rowHeight));
        const endIdx = Math.min(startIdx + this.visibleRows + this.buffer, items.length);
        const visibleMonths = months.slice(0, this.loadedMonths);

        if (!force && 
            startIdx === this.lastRenderedStartIdx && 
            visibleMonths.length === this.lastRenderedLoadedMonths && 
            this.tbody.children.length > 0) {
            return;
        }

        this.lastRenderedStartIdx = startIdx;
        this.lastRenderedLoadedMonths = visibleMonths.length;

        let html = '';
        const colCount = visibleMonths.length + 1; // Category column + month columns

        if (startIdx > 0) {
            const topSpacerHeight = startIdx * this.rowHeight;
            html += `<tr style="height: ${topSpacerHeight}px;"><td colspan="${colCount}" style="padding: 0; border: 0; height: ${topSpacerHeight}px;"></td></tr>`;
        }

        for (let i = startIdx; i < endIdx; i++) {
            const item = items[i];
            if (!item) break;

            html += `<tr class="hover:bg-gray-50/80 transition-colors" style="height:${this.rowHeight}px;">`;
            html += this._createCategoryCell(item);

            visibleMonths.forEach(month => {
                html += this._createCell(item.id, month, entries);
            });
            html += `</tr>`;
        }

        if (endIdx < items.length) {
            const bottomSpacerHeight = (items.length - endIdx) * this.rowHeight;
            html += `<tr style="height: ${bottomSpacerHeight}px;"><td colspan="${colCount}" style="padding: 0; border: 0; height: ${bottomSpacerHeight}px;"></td></tr>`;
        }

        this.tbody.innerHTML = html;

        // Események közvetlen csatolása a frissen lerenderelt elemekhez
        this.tbody.querySelectorAll('.cell-interactive').forEach(cell => {
            cell.addEventListener('click', (e) => {
                this.app.uiController.handleCellClick(e.currentTarget);
            });
        });

        this.tbody.querySelectorAll('.dblclick-row-purge').forEach(el => {
            el.addEventListener('dblclick', (e) => {
                if (e.target.closest('button')) return;
                this.app.uiController.handleRowDeleteSequence(
                    el.dataset.itemid, 
                    el.dataset.itemname
                );
            });

            // Hosszú nyomás (longpress) eseménykezelő a kategória átnevezéshez és törléshez
            let pressTimer = null;
            let isLongPressTriggered = false;
            let startX = 0;
            let startY = 0;

            const startPress = (e) => {
                if (e.target.closest('button')) return;
                isLongPressTriggered = false;
                
                // Track coordinates to detect scrolling/moving
                if (e.touches && e.touches[0]) {
                    startX = e.touches[0].clientX;
                    startY = e.touches[0].clientY;
                } else {
                    startX = e.clientX;
                    startY = e.clientY;
                }

                if (pressTimer) clearTimeout(pressTimer);
                pressTimer = setTimeout(async () => {
                    isLongPressTriggered = true;
                    // Vizuális visszajelzés (pirosas-rózsaszínes finom kijelölés a haptikus érzetért)
                    el.classList.add('bg-rose-100');
                    
                    try {
                        const action = await this.app.hmiNotif.showCategoryActionsModal(el.dataset.itemname);
                        el.classList.remove('bg-rose-100');
                        
                        if (action === 'rename') {
                            this.app.uiController.handleRenameItem(parseInt(el.dataset.itemid), el.dataset.itemname);
                        } else if (action === 'delete') {
                            // Wait for the category actions modal to finish its 150ms close animation
                            // before triggering the confirmation modal in the delete sequence
                            await new Promise(r => setTimeout(r, 250));
                            this.app.uiController.handleRowDeleteSequence(el.dataset.itemid, el.dataset.itemname);
                        }
                    } catch (err) {
                        console.error('[LongPress] Hiba:', err);
                        el.classList.remove('bg-rose-100');
                    }
                }, 600); // 600ms tartás elegendő a szándékos hosszú nyomáshoz
            };

            const cancelPress = () => {
                if (pressTimer) {
                    clearTimeout(pressTimer);
                    pressTimer = null;
                }
                el.classList.remove('bg-rose-100');
            };

            const movePress = (e) => {
                let currentX = 0;
                let currentY = 0;
                if (e.touches && e.touches[0]) {
                    currentX = e.touches[0].clientX;
                    currentY = e.touches[0].clientY;
                } else {
                    currentX = e.clientX;
                    currentY = e.clientY;
                }

                // Ha elmozdult több mint 10px-t, akkor ez görgetés vagy vonszolás, töröljük a hosszú nyomást!
                if (Math.abs(currentX - startX) > 10 || Math.abs(currentY - startY) > 10) {
                    cancelPress();
                }
            };

            // Események regisztrálása egérhez és érintéshez is
            el.addEventListener('mousedown', startPress);
            el.addEventListener('mouseup', cancelPress);
            el.addEventListener('mouseleave', cancelPress);
            el.addEventListener('mousemove', movePress);

            el.addEventListener('touchstart', startPress, { passive: true });
            el.addEventListener('touchend', (e) => {
                cancelPress();
                if (isLongPressTriggered) {
                    e.preventDefault(); // Megakadályozzuk az esetleges kattintást/fókuszt
                }
            });
            el.addEventListener('touchmove', movePress, { passive: true });
            el.addEventListener('touchcancel', cancelPress);
            
            // Kontextus menü letiltása a hosszú nyomás alatt, hogy mobilon ne jöjjön be a gyári menü
            el.addEventListener('contextmenu', (e) => {
                if (isLongPressTriggered) {
                    e.preventDefault();
                }
            });
        });
    }

    // ================================================================
    // === CELLÁK LÉTREHOZÁSA ===
    // ================================================================

    _createCategoryCell(item) {
        const iconData = CategoryIcons.getIconData(item.name);
        const hasCustomColor = item.color && item.color !== '#dbeafe';
        const bgColor = hasCustomColor ? item.color + '15' : '';
        const borderStyle = hasCustomColor ? `border: 1.5px solid ${item.color}` : '';
        const iconColorStyle = hasCustomColor ? `color: ${item.color}` : '';

        return `
            <td class="px-6 py-4 font-bold text-gray-900 bg-gray-50 border-r border-gray-100 md:sticky md:left-0 md:z-10 
                       dblclick-row-purge cursor-pointer hover:bg-red-50 transition-colors min-w-[100px] w-[1%] whitespace-nowrap"
                data-itemid="${item.id}" data-itemname="${item.name}">
                <div class="flex items-center gap-3">
                    <div class="w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0 transition-all shadow-sm ${bgColor ? '' : iconData.bgClass}" 
                         style="${bgColor ? `background-color: ${bgColor};` : ''} ${borderStyle}">
                        <i class="${iconData.iconClass} text-xs ${bgColor ? '' : iconData.textClass}" style="${iconColorStyle}"></i>
                    </div>
                    <span>${item.name}</span>
                </div>
            </td>`;
    }

    _createCell(itemId, month, entries) {
        const cellBaseKey = `${itemId}_${month}`;
        const cellEntries = entries.filter(e => {
            if (!e.cellKey) return false;
            return e.cellKey === cellBaseKey || e.cellKey.startsWith(cellBaseKey + '_');
        });

        let huf = 0, eur = 0;
        let hasStorno = false;
        let allStorno = cellEntries.length > 0;
        let stornoHuf = 0, stornoEur = 0;

        cellEntries.forEach(e => {
            if (e.isStorno) {
                hasStorno = true;
                if (e.currency === 'EUR') stornoEur += e.amount;
                else stornoHuf += e.amount;
            } else {
                allStorno = false;
                if (e.currency === 'EUR') eur += e.amount;
                else huf += e.amount;
            }
        });

        let style = '';
        const colorEntry = cellEntries.find(e => e.color && e.color !== 'transparent');
        if (colorEntry) style = `background-color: ${colorEntry.color};`;

        // Ha sztornó van, különleges stílust kaphat a cella
        if (allStorno) {
            style += 'background-color: rgba(254, 242, 242, 0.6);';
        }

        const eurRate = this.app.config?.eurRate || 400;
        const convertedHuf = Math.round(eur * eurRate);
        const convertedStornoHuf = Math.round(stornoEur * eurRate);

        let content = '';
        if (huf + eur === 0) {
            if (allStorno) {
                content = `<div class="text-xs font-mono leading-tight text-center text-red-500/70 opacity-65 flex flex-col items-center justify-center line-through decoration-red-500 decoration-1">
                    <div class="flex items-center gap-1 mb-0.5 text-[9px] font-bold bg-red-100 text-red-600 px-1 rounded"><i class="fas fa-ban"></i> SZTORNÓ</div>
                    ${stornoHuf ? `<div>${stornoHuf.toLocaleString('hu-HU')} Ft</div>` : ''}
                    ${stornoEur ? `<div>${stornoEur} EUR<div class="text-[9px] font-normal">(${convertedStornoHuf.toLocaleString('hu-HU')} Ft)</div></div>` : ''}
                   </div>`;
            } else {
                content = `<span class="text-gray-300 text-xl font-light">-</span>`;
            }
        } else {
            content = `<div class="text-xs font-mono leading-tight text-center relative">
                ${huf ? `<div>${huf.toLocaleString('hu-HU')} Ft</div>` : ''}
                ${eur ? `<div class="text-emerald-700">${eur} EUR<div class="text-[10px] text-gray-500 font-normal">(${convertedHuf.toLocaleString('hu-HU')} Ft)</div></div>` : ''}
                ${hasStorno ? `<div class="absolute -top-1 -right-1 text-red-500 text-[10px] bg-red-50 rounded-full w-4 h-4 flex items-center justify-center border border-red-100 shadow-sm" title="Részben sztornózott tételt tartalmaz!"><i class="fas fa-ban"></i></div>` : ''}
               </div>`;
        }

        return `<td class="cell-interactive px-4 py-4 text-center border-l border-gray-100 cursor-pointer w-40 min-w-[160px] max-w-[160px]" 
                    data-cellbasekey="${cellBaseKey}" style="${style}">${content}</td>`;
    }

    // ================================================================
    // === GÖRGETÉS KEZELÉS ===
    // ================================================================

    _attachScrollHandlers(items, months, entries) {
        if (!this.wrapper) return;

        this.wrapper.onscroll = () => {
            if (this.isRendering) return;
            this.isRendering = true;

            if (this._rafId) cancelAnimationFrame(this._rafId);
            
            this._rafId = requestAnimationFrame(() => {
                this._renderVisibleRows(items, months, entries);
                this.isRendering = false;

                if (this.wrapper.scrollLeft + this.wrapper.clientWidth > this.wrapper.scrollWidth - 400) {
                    this._loadMoreMonths(months, items, entries);
                }
            });
        };
    }

    async _loadMoreMonths(months, items, entries) {
        if (this.loadedMonths >= months.length) return;
        this.loadedMonths = Math.min(this.loadedMonths + this.monthsPerLoad, months.length);
        this.render();
    }

    // ================================================================
    // === ESEMÉNYKEZELŐK ===
    // ================================================================

    _attachCellEvents() {
        // A cella események már közvetlenül a _renderVisibleRows-ban csatolódnak
    }

    // ================================================================
    // === ÜRES ÁLLAPOT ===
    // ================================================================

    _showEmptyState() {
        const container = document.getElementById('mainTableContainer');
        if (container) {
            container.innerHTML = `
                <div class="p-12 text-center text-gray-400">
                    <div class="text-xl font-bold mb-2">Nincs még adat</div>
                    <div class="mb-4">A táblázat üres — adj hozzá kategóriákat és hónapokat, vagy generálj tesztadatokat.</div>
                    <div class="flex items-center justify-center gap-3">
                        <button id="vtGenerateTestData" class="px-4 py-2 bg-emerald-600 text-white rounded-xl">Generálj tesztadatokat</button>
                        <button id="vtClearMessage" class="px-4 py-2 bg-gray-100 text-gray-700 rounded-xl">Bezárás</button>
                    </div>
                </div>`;

            // Attach actions
            const genBtn = document.getElementById('vtGenerateTestData');
            if (genBtn) {
                genBtn.addEventListener('click', async () => {
                    try {
                        console.log('[VTABLE] Generating test data...');
                        if (window.app && typeof window.app.generateTestData === 'function') {
                            const count = await window.app.generateTestData(30);
                            console.log('[VTABLE] Test data generated:', count);
                            await window.app.items.load();
                            await window.app.months.load();
                            await window.app.entries.load();
                            window.app.renderer.renderTable();
                            window.app.hmiNotif?.showToast('Tesztadatok létrehozva', 'success');
                        } else {
                            console.warn('[VTABLE] window.app.generateTestData not available');
                        }
                    } catch (e) {
                        console.error('[VTABLE] Tesztadat generálás hiba', e);
                        window.app.hmiNotif?.showToast('Tesztadat generálás sikertelen', 'error');
                    }
                });
            }

            const closeBtn = document.getElementById('vtClearMessage');
            if (closeBtn) closeBtn.addEventListener('click', () => container.innerHTML = '');
        }
    }

/**
 * Lábléc státusz frissítése
 */
updateFooterStatus(message, isError = false) {
    const statusTexts = document.querySelectorAll('[id="saveStatusText"]');
    const leds = document.querySelectorAll('[id="saveLed"]');
    const lastSaveEls = document.querySelectorAll('[id="lastSaveTime"]');
    
    statusTexts.forEach(statusText => {
        statusText.textContent = message;
        statusText.className = `font-mono uppercase tracking-wider text-[10px] ${isError ? 'text-red-500' : 'text-gray-500'}`;
    });
    leds.forEach(led => {
        led.className = `w-2.5 h-2.5 rounded-full shadow-sm transition-all duration-300 ${isError ? 'bg-red-500 animate-pulse' : 'bg-emerald-500'}`;
    });
    if (!isError) {
        const now = new Date();
        const formattedTime = now.toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        lastSaveEls.forEach(lastSaveEl => {
            lastSaveEl.textContent = formattedTime;
        });
    }
}

/**
 * LED frissítés (EUR árfolyamhoz)
 */
updateLed(rate, mode) {
    const led = document.getElementById('eurLed');
    const text = document.getElementById('eurStatusText');
    if (!led || !text) return;
    
    if (mode === 'live') {
        led.className = 'w-3 h-3 rounded-full bg-emerald-500';
        text.textContent = `EUR: ${rate} Ft (live)`;
        text.className = 'text-emerald-700';
    } else {
        led.className = 'w-3 h-3 rounded-full bg-amber-500';
        text.textContent = `EUR: ${rate} Ft (cache)`;
        text.className = 'text-amber-700';
    }
}

    // ================================================================
    // === TAKARÍTÁS ===
    // ================================================================

    destroy() {
        if (this._rafId) cancelAnimationFrame(this._rafId);
        if (this.wrapper) this.wrapper.onscroll = null;
        console.log('[VirtualTableRenderer] Takarítva');
    }
}