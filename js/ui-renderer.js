// js/ui-renderer.js - Végleges optimalizált verzió (2026)
import { CategoryIcons } from './category-icons.js';

export class UIRenderer {
    constructor(app) {
        this.app = app;
        this.currentEurRate = 400;
        this.visibleRows = 25;
        this.scrollOffset = 0;
        this.monthsPerPage = 12;
        this.loadedMonthsCount = 12;
        this.isLoadingMore = false;
        this.rowCache = new Map();
    }

    getEffectiveEurRate() {
        this.currentEurRate = Number(this.app.config?.eurRate || 400);
        return this.currentEurRate;
    }

    renderTable() {
        const container = document.getElementById('mainTableContainer');
        if (!container) return;

        const items = this.app.items.items || [];
        const allMonths = this.app.months.months || [];
        const entries = this.app.entries.entries || [];

        if (items.length === 0 || allMonths.length === 0) {
            container.innerHTML = `<div class="p-12 text-center text-gray-400">Nincs megjeleníthető adat.<br>Nyiss meg hónapokat!</div>`;
            return;
        }

        this.getEffectiveEurRate();
        this.loadedMonthsCount = Math.min(this.monthsPerPage, allMonths.length);

        let html = `
            <div class="overflow-auto rounded-3xl border border-gray-200 bg-white shadow-sm relative" 
                 style="max-height: 78vh;" id="tableWrapper">
                
                <!-- Loading indicator -->
                <div id="monthLoadingIndicator" class="hidden absolute bottom-4 right-4 bg-white shadow-lg rounded-2xl px-4 py-2 text-sm flex items-center gap-2 z-30">
                    <i class="fas fa-spinner fa-spin text-blue-600"></i>
                    <span>További hónapok betöltése...</span>
                </div>

                <table class="w-full border-collapse text-left text-sm" id="mainTable">
                    <thead class="bg-gray-50 sticky top-0 z-20">
                        <tr>
                            <th class="px-6 py-4 font-black text-gray-700 bg-gray-100 w-80 min-w-[280px]">Kategória</th>`;

        const visibleMonths = allMonths.slice(0, this.loadedMonthsCount);
        visibleMonths.forEach(m => {
            html += `<th class="px-6 py-4 text-center border-l border-gray-200 min-w-[160px]">${m}</th>`;
        });
        html += `</tr></thead><tbody id="virtualTbody"></tbody></table></div>`;

        container.innerHTML = html;

        this._renderVisibleRows(items, visibleMonths, entries);
        this._attachRAFScrollHandlers(allMonths, items, entries);
        this._attachTableEvents();
    }

    _renderVisibleRows(items, visibleMonths, entries) {
        const tbody = document.getElementById('virtualTbody');
        if (!tbody) return;

        let html = '';
        const start = this.scrollOffset;
        const end = Math.min(start + this.visibleRows, items.length);

        for (let i = start; i < end; i++) {
            const item = items[i];
            let rowHtml = `<tr class="hover:bg-gray-50/80 transition-colors" style="height: 52px;">`;
            rowHtml += this._createCategoryCell(item);

            visibleMonths.forEach(month => {
                rowHtml += this._createCellHTML(item.id, month, entries);
            });
            rowHtml += `</tr>`;
            html += rowHtml;
        }
        tbody.innerHTML = html;
    }

    _createCategoryCell(item) {
        const iconData = CategoryIcons.getIconData(item.name);
        const hasCustomColor = item.color && item.color !== '#dbeafe';
        const bgColor = hasCustomColor ? item.color + '15' : '';
        const borderStyle = hasCustomColor ? `border: 1.5px solid ${item.color}` : '';
        const iconColorStyle = hasCustomColor ? `color: ${item.color}` : '';

        return `
            <td class="px-6 py-4 font-bold text-gray-900 bg-gray-50 border-r border-gray-100 dblclick-row-purge cursor-pointer hover:bg-red-50 transition-colors"
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

    _createCellHTML(itemId, month, entries) {
        const cellBaseKey = `${itemId}_${month}`;
        const cellEntries = entries.filter(e => e.cellKey && e.cellKey.startsWith(cellBaseKey));
        
        let huf = 0, eur = 0;
        cellEntries.forEach(e => e.currency === 'EUR' ? eur += e.amount : huf += e.amount);

        let style = '';
        const colors = [...new Set(cellEntries.map(e => e.color).filter(Boolean))];
        if (colors.length === 1 && colors[0] !== 'transparent') {
            style = `background-color:${colors[0]}`;
        }

        const eurRate = this.app.config?.eurRate || 400;
        const convertedHuf = Math.round(eur * eurRate);

        let content = (huf === 0 && eur === 0) ? '-' : 
            `<div class="text-xs font-mono leading-tight">` +
            (huf ? `<div>${huf.toLocaleString('hu-HU')} Ft</div>` : '') +
            (eur ? `<div class="text-emerald-700">${eur} EUR<div class="text-[10px] text-gray-500 font-normal">(${convertedHuf.toLocaleString('hu-HU')} Ft)</div></div>` : '') +
            `</div>`;

        return `<td class="px-4 py-4 text-center border-l border-gray-100 cell-interactive cursor-pointer" 
                    data-cellbasekey="${cellBaseKey}" style="${style}">${content}</td>`;
    }

    // ==================== SCROLL + requestAnimationFrame ====================
    _attachRAFScrollHandlers(allMonths, items, entries) {
        const wrapper = document.getElementById('tableWrapper');
        if (!wrapper) return;

        let ticking = false;

        wrapper.addEventListener('scroll', () => {
            if (!ticking) {
                requestAnimationFrame(() => {
                    // Vertical scroll (sorok)
                    const newOffset = Math.floor(wrapper.scrollTop / 52);
                    if (Math.abs(newOffset - this.scrollOffset) > 4) {
                        this.scrollOffset = newOffset;
                        this._renderVisibleRows(items, allMonths.slice(0, this.loadedMonthsCount), entries);
                    }

                    // Horizontal infinite scroll + loading indicator
                    if (wrapper.scrollLeft + wrapper.clientWidth > wrapper.scrollWidth - 400) {
                        this._loadMoreMonths(allMonths, items, entries);
                    }

                    ticking = false;
                });
                ticking = true;
            }
        });
    }

    async _loadMoreMonths(allMonths, items, entries) {
        if (this.loadedMonthsCount >= allMonths.length || this.isLoadingMore) return;

        this.isLoadingMore = true;
        const loadingEl = document.getElementById('monthLoadingIndicator');
        if (loadingEl) loadingEl.classList.remove('hidden');

        // Kis késleltetés a jobb UX miatt
        await new Promise(resolve => setTimeout(resolve, 180));

        const oldCount = this.loadedMonthsCount;
        this.loadedMonthsCount = Math.min(this.loadedMonthsCount + 8, allMonths.length);

        if (this.loadedMonthsCount > oldCount) {
            console.log(`[Renderer] +${this.loadedMonthsCount - oldCount} hónap betöltve`);
            this.renderTable(); // Teljes újrarender
        }

        this.isLoadingMore = false;
        if (loadingEl) loadingEl.classList.add('hidden');
    }

    _attachTableEvents() {
        const table = document.getElementById('mainTable');
        if (!table) return;

        table.querySelectorAll('.cell-interactive').forEach(cell => {
            cell.addEventListener('click', (e) => this.app.uiController.handleCellClick(e.currentTarget));
        });

        table.querySelectorAll('.dblclick-row-purge').forEach(el => {
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
                            this.app.uiController.handleRenameItem(el.dataset.itemid, el.dataset.itemname);
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

    clearCache() {
        this.rowCache.clear();
    }
    
  destroy() {
    this.rowCache.clear();
     this.scrollOffset = 0;
    console.log('[UIRenderer] Cache és állapot takarítva');
  }
}