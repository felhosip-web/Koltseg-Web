// js/virtual-table-renderer.js
// Virtual Table Renderer - Teljesítményoptimalizált virtuális táblázat
// JAVÍTOTT VERZIÓ: renderTable() alias hozzáadva

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

        if (items.length === 0 || months.length === 0) {
            this._showEmptyState();
            return;
        }

        this._initContainer();
        this._renderHeader(months);
        this._renderVisibleRows(items, months, entries);
        this._attachScrollHandlers(items, months, entries);
        this._attachCellEvents();
    }

    /**
     * ALIAS: renderTable() – kompatibilitás az app.js-vel
     */
    renderTable() {
        return this.render();
    }

    // ================================================================
    // === KONTAINER INICIALIZÁLÁS ===
    // ================================================================

    _initContainer() {
        const container = document.getElementById('mainTableContainer');
        if (!container) return;

        container.innerHTML = `
            <div id="vtWrapper" class="overflow-auto rounded-3xl border border-gray-200 bg-white shadow-sm relative" 
                 style="max-height: 76vh; contain: strict;">
                <table class="w-full border-collapse text-sm" id="vtTable">
                    <thead id="vtThead" class="bg-gray-50 sticky top-0 z-20"></thead>
                    <tbody id="vtTbody" class="relative"></tbody>
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
            <th class="px-6 py-4 font-black text-gray-700 bg-gray-100 w-80 min-w-[280px] sticky left-0 z-30">Kategória</th>`;

        const visibleMonths = months.slice(0, this.loadedMonths);
        visibleMonths.forEach(m => {
            html += `<th class="px-4 py-4 text-center border-l border-gray-200 min-w-[160px] whitespace-nowrap">${m}</th>`;
        });
        html += `</tr>`;
        thead.innerHTML = html;
    }
    
// 2. RÉSZ: Sorok render, Események, Segédfüggvények, Destroy

    // ================================================================
    // === SOROK RENDER ===
    // ================================================================

    _renderVisibleRows(items, months, entries) {
        if (!this.tbody || !this.wrapper) return;

        const startIdx = Math.floor(this.wrapper.scrollTop / this.rowHeight);
        const endIdx = Math.min(startIdx + this.visibleRows + this.buffer, items.length);

        let html = '';
        const visibleMonths = months.slice(0, this.loadedMonths);

        for (let i = startIdx; i < endIdx; i++) {
            const item = items[i];
            if (!item) break;

            html += `<tr class="virtual-row" style="height: ${this.rowHeight}px; transform: translateY(${i * this.rowHeight}px);">`;
            html += this._createCategoryCell(item);

            visibleMonths.forEach(month => {
                html += this._createCell(item.id, month, entries);
            });
            html += `</tr>`;
        }

        this.tbody.innerHTML = html;
    }

    // ================================================================
    // === CELLÁK LÉTREHOZÁSA ===
    // ================================================================

    _createCategoryCell(item) {
        return `
            <td class="px-6 py-4 font-bold text-gray-900 bg-gray-50 border-r border-gray-100 sticky left-0 z-10 
                       dblclick-row-purge cursor-pointer hover:bg-red-50 transition-colors"
                data-itemid="${item.id}" data-itemname="${item.name}">
                <div class="flex items-center gap-3">
                    <span class="w-3.5 h-3.5 rounded-full flex-shrink-0" style="background-color: ${item.color || '#dbeafe'}"></span>
                    <span class="truncate">${item.name}</span>
                </div>
            </td>`;
    }

    _createCell(itemId, month, entries) {
        const cellBaseKey = `${itemId}_${month}`;
        const cellEntries = entries.filter(e => e.cellKey && e.cellKey.startsWith(cellBaseKey));

        let huf = 0, eur = 0;
        cellEntries.forEach(e => {
            if (e.currency === 'EUR') eur += e.amount;
            else huf += e.amount;
        });

        let style = '';
        const colorEntry = cellEntries.find(e => e.color && e.color !== 'transparent');
        if (colorEntry) style = `background-color: ${colorEntry.color};`;

        const content = (huf + eur === 0) 
            ? `<span class="text-gray-300 text-xl font-light">-</span>`
            : `<div class="text-xs font-mono leading-tight text-center">
                ${huf ? `<div>${huf.toLocaleString('hu-HU')} Ft</div>` : ''}
                ${eur ? `<div class="text-emerald-700">${eur} EUR</div>` : ''}
               </div>`;

        return `<td class="cell-interactive px-4 py-4 text-center border-l border-gray-100 cursor-pointer" 
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
        this.tbody?.querySelectorAll('.cell-interactive').forEach(cell => {
            cell.addEventListener('click', (e) => {
                this.app.uiController.handleCellClick(e.currentTarget);
            });
        });

        this.tbody?.querySelectorAll('.dblclick-row-purge').forEach(el => {
            el.addEventListener('dblclick', (e) => {
                if (e.target.closest('button')) return;
                this.app.uiController.handleRowDeleteSequence(
                    el.dataset.itemid, 
                    el.dataset.itemname
                );
            });
        });
    }

    // ================================================================
    // === ÜRES ÁLLAPOT ===
    // ================================================================

    _showEmptyState() {
        const container = document.getElementById('mainTableContainer');
        if (container) {
            container.innerHTML = `
                <div class="p-12 text-center text-gray-400">
                    Nincs megjeleníthető adat.<br>
                    Nyiss meg hónapokat és adj hozzá kategóriákat.
                </div>`;
        }
    }

/**
 * Lábléc státusz frissítése
 */
updateFooterStatus(message, isError = false) {
    const statusText = document.getElementById('saveStatusText');
    const led = document.getElementById('saveLed');
    
    if (statusText) {
        statusText.textContent = message;
        statusText.className = `font-mono uppercase tracking-wider text-[10px] ${isError ? 'text-red-500' : 'text-gray-500'}`;
    }
    if (led) {
        led.className = `w-2.5 h-2.5 rounded-full shadow-sm transition-all duration-300 ${isError ? 'bg-red-500 animate-pulse' : 'bg-emerald-500'}`;
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