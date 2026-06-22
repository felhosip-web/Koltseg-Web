// js/ui-renderer.js - Optimalizált verzió
export class UIRenderer {
    constructor(app) {
        this.app = app;
    }

    getEffectiveEurRate() {
        return Number(
            this.app.config?.eurRate ||
            this.app.eurRate ||
            this.app.settings?.eurRate ||
            localStorage.getItem('eurRate') ||
            localStorage.getItem('matrix_settings_eurRate') ||
            400
        );
    }

    renderTable() {
        const container = document.getElementById('mainTableContainer');
        if (!container) return;

        const items = this.app.items.items;
        const months = this.app.months.months;
        const entries = this.app.entries.entries;

        if (items.length === 0 || months.length === 0) {
            container.innerHTML = '<div class="p-8 text-center text-gray-400 font-medium">Nincs megjeleníthető adat. Nyiss meg egy hónapot vagy adj hozzá tételt!</div>';
            return;
        }

        const tableWrapper = document.createElement('div');
        tableWrapper.className = 'overflow-x-auto rounded-3xl border border-gray-200 bg-white shadow-sm mb-6';

        const table = document.createElement('table');
        table.className = 'w-full border-collapse text-left text-sm';

        // HEAD
        const thead = document.createElement('thead');
        thead.className = 'bg-gray-50 text-xs font-bold uppercase tracking-wider text-gray-500 border-b border-gray-200';
        const headerRow = document.createElement('tr');
        
        const catTh = document.createElement('th');
        catTh.className = 'px-6 py-4 font-black text-gray-700 bg-gray-100/50 select-none';
        catTh.textContent = 'Költségtípus / Kategória';
        headerRow.appendChild(catTh);

        months.forEach(m => {
            const th = document.createElement('th');
            th.className = 'px-6 py-4 text-center border-l border-gray-200 min-w-[140px] select-none';
            th.textContent = m;
            headerRow.appendChild(th);
        });
        thead.appendChild(headerRow);
        table.appendChild(thead);

        // BODY
        const tbody = document.createElement('tbody');
        tbody.className = 'divide-y divide-gray-100 font-medium text-gray-700';
        const currentEurRate = this.getEffectiveEurRate();

        items.forEach(item => {
            const row = document.createElement('tr');
            row.className = 'hover:bg-gray-50/80 transition-colors';

            // Kategória oszlop
            const catCell = document.createElement('td');
            catCell.className = 'px-6 py-4 font-bold text-gray-900 bg-gray-50/30 select-none cursor-pointer dblclick-row-purge hover:bg-red-50 group transition-colors';
            catCell.dataset.itemid = item.id;
            catCell.dataset.itemname = item.name;

            catCell.innerHTML = `
    <div class="flex items-center justify-between gap-2">
        <div class="flex items-center gap-2">
            <!-- SZÍNPÖTTY A KATEGÓRIA MELLETT -->
            <span class="w-3 h-3 rounded-full inline-block flex-shrink-0" style="background-color: ${item.color || '#dbeafe'};"></span>
            <i class="fas fa-layer-group text-gray-400 text-xs group-hover:text-red-500 transition-colors"></i>
            <span>${item.name}</span>
        </div>
        <div class="flex gap-1">
            <button class="btn-rename-item p-1 text-gray-400 hover:text-blue-600 rounded transition opacity-40 group-hover:opacity-100" 
                    data-itemid="${item.id}" 
                    data-itemname="${item.name}">
                <i class="fas fa-pen text-xs"></i>
            </button>
            <button class="btn-direct-row-delete p-1 text-gray-300 hover:text-red-600 rounded transition opacity-40 group-hover:opacity-100" 
                    data-itemid="${item.id}" 
                    data-itemname="${item.name}">
                <i class="fas fa-trash-can text-xs"></i>
            </button>
        </div>
    </div>
`;
            row.appendChild(catCell);

            // Hónap cellák
            months.forEach(month => {
                //                const cellBaseKey = `\( {item.id}_ \){month}`;
                const cellBaseKey = `${item.id}_${month}`;
                const cellEntries = entries.filter(e => e.cellKey && e.cellKey.startsWith(cellBaseKey));

                let hufSum = 0, eurSum = 0;
                let uniqueColors = new Set();

                cellEntries.forEach(e => {
                    if (e.currency === 'EUR') eurSum += e.amount;
                    else hufSum += e.amount;
                    if (e.color && e.color !== 'transparent') uniqueColors.add(e.color);
                });

                const cell = document.createElement('td');
                cell.className = 'px-4 py-3 text-center border-l border-gray-100 cell-interactive active:scale-95 transition-all cursor-pointer relative select-none';
                cell.dataset.cellbasekey = cellBaseKey;

                if (uniqueColors.size === 1) {
                    cell.style.backgroundColor = Array.from(uniqueColors)[0];
                } else if (uniqueColors.size > 1) {
                    cell.style.background = `linear-gradient(135deg, ${Array.from(uniqueColors).join(', ')})`;
                }

                if (hufSum === 0 && eurSum === 0) {
                    cell.innerHTML = '<span class="text-gray-300 font-normal">-</span>';
                } else {
                    let content = '<div class="space-y-0.5 font-mono text-xs font-black text-gray-800">';
                    if (hufSum > 0) content += `<div class="text-blue-900">${hufSum.toLocaleString('hu-HU')} Ft</div>`;
                    if (eurSum > 0) {
                        const conv = Math.round(eurSum * currentEurRate);
                        content += `<div class="text-emerald-700">${eurSum.toLocaleString('hu-HU')} EUR</div>`;
                        content += `<div class="text-[9px] text-gray-400">(~${conv.toLocaleString('hu-HU')} Ft)</div>`;
                    }
                    content += '</div>';
                    cell.innerHTML = content;
                }

                if (cellEntries.length > 1) {
                    const badge = document.createElement('span');
                    badge.className = 'absolute top-1 right-1 px-1.5 py-0.5 bg-gray-800 text-white font-mono text-[7px] rounded font-black shadow-sm';
                    badge.textContent = `${cellEntries.length} tétel`;
                    cell.appendChild(badge);
                }

                row.appendChild(cell);
            });

            tbody.appendChild(row);
        });

        table.appendChild(tbody);

        // === ÖSSZESÍTŐ SOR (TFOOT) ===
        const tfoot = document.createElement('tfoot');
        tfoot.className = 'bg-gray-100 text-xs font-black uppercase tracking-wider text-gray-700 border-t-2 border-gray-300 sticky bottom-0';
        const totalRow = document.createElement('tr');
        totalRow.className = 'bg-gray-100/90 backdrop-blur-xs font-bold';

        const totalLabel = document.createElement('td');
        totalLabel.className = 'px-6 py-4 font-black text-gray-900 bg-gray-200/50 select-none flex items-center gap-2';
        totalLabel.innerHTML = '<i class="fas fa-calculator text-gray-600"></i><span>HAVIDÍJ SZUMMA</span>';
        totalRow.appendChild(totalLabel);

        const validItemIds = items.map(i => String(i.id));
        months.forEach(month => {
            let columnHuf = 0, columnEur = 0;
            entries.forEach(e => {
                if (e.cellKey && e.cellKey.includes(`_${month}`)) {
                    const itemId = e.cellKey.split('_')[0];
                    if (validItemIds.includes(itemId)) {
                        if (e.currency === 'EUR') columnEur += e.amount;
                        else columnHuf += e.amount;
                    }
                }
            });

            const td = document.createElement('td');
            td.className = 'px-4 py-3 text-center border-l border-gray-200 font-mono text-xs font-black bg-gray-100';

            if (columnHuf === 0 && columnEur === 0) {
                td.innerHTML = '<span class="text-gray-400 font-normal">-</span>';
            } else {
                let html = '<div class="space-y-1">';
                if (columnHuf > 0) html += `<div class="text-blue-900">${columnHuf.toLocaleString('hu-HU')} Ft</div>`;
                if (columnEur > 0) {
                    const conv = Math.round(columnEur * currentEurRate);
                    html += `<div class="text-emerald-700">${columnEur.toLocaleString('hu-HU')} EUR</div>`;
                    html += `<div class="text-[10px] text-gray-500">(~${conv.toLocaleString('hu-HU')} Ft)</div>`;
                }
                html += '</div>';
                td.innerHTML = html;
            }
            totalRow.appendChild(td);
        });

        tfoot.appendChild(totalRow);
        table.appendChild(tfoot);

        tableWrapper.appendChild(table);
        container.innerHTML = '';
        container.appendChild(tableWrapper);

        this._attachTableEvents(container);
    }

    _attachTableEvents(container) {
        container.querySelectorAll('.cell-interactive').forEach(cell => {
            cell.addEventListener('click', (e) => {
                this.app.uiController.handleCellClick(e.currentTarget);
            });
        });

        container.querySelectorAll('.dblclick-row-purge').forEach(header => {
            header.addEventListener('dblclick', (e) => {
                if (e.target.closest('.btn-direct-row-delete')) return;
                this.app.uiController.handleRowDeleteSequence(
                    header.dataset.itemid, 
                    header.dataset.itemname
                );
            });
        });

        container.querySelectorAll('.btn-direct-row-delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.app.uiController.handleRowDeleteSequence(
                    btn.dataset.itemid, 
                    btn.dataset.itemname
                );
            });
        });

        container.querySelectorAll('.btn-rename-item').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.app.uiController.handleRenameItem(
                    parseInt(btn.dataset.itemid), 
                    btn.dataset.itemname
                );
            });
        });
    }

    updateLed(rate, mode) {
        const led = document.getElementById('eurLed');
        const text = document.getElementById('eurStatusText');
        if (!led || !text) return;
        if (mode === 'live') {
            led.className = 'w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-md animate-pulse';
            text.textContent = `EUR: ${rate} Ft (ÉLŐ)`;
        } else {
            led.className = 'w-2.5 h-2.5 rounded-full bg-amber-500 shadow-sm';
            text.textContent = `EUR: ${rate} Ft (BIZTONSÁGI)`;
        }
    }

    updateFooterStatus(statusMessage, isError = false) {
        const led = document.getElementById('saveLed');
        const text = document.getElementById('saveStatusText');
        const timeEl = document.getElementById('lastSaveTime');

        if (!led || !text) return;

        led.className = isError ? 'w-2.5 h-2.5 rounded-full bg-red-500 shadow-md animate-bounce' : 'w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-md animate-ping';
        text.textContent = statusMessage;

        const now = new Date();
        if (timeEl) {
            timeEl.textContent = `${now.toLocaleTimeString('hu-HU')} (${now.toLocaleDateString('hu-HU')})`;
        }

        setTimeout(() => {
            led.className = isError ? 'w-2.5 h-2.5 rounded-full bg-red-600 shadow-sm' : 'w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-sm';
        }, 1500);
    }
    
    renderSummary() {
    // Ez a metódus már nem szükséges, mert a statisztika fülön külön megjelenik minden.
    // Üresen hagyjuk, hogy a régi hívások ne dobjanak hibát.
        return;
    }
}