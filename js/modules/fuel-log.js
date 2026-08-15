// js/modules/fuel-log.js - v1.2.0 - Tankolási & Km Nyilvántartó Modul
export const fuelLogModuleScript = `
return {
    id: 'plugin_fuel_log',
    name: 'Tankolás & Km Napló',
    version: '1.2.0',
    changelog: [
        'Automatikus költségvetés átvezetés meglévő/új tételként',
        'Statisztikák és átlagfogyasztás grafikon vizualizáció',
        'Benzinkút helymeghatározás finomhangolása',
        'Üzemanyagárak grafikonos követése és exportálása'
    ],
    category: 'automotive',
    author: 'KöltségWeb Lab',
    description: 'Km állás, tankolt liter, egységár és benzinkút megjegyzés rögzítése helyi tárolóval és felhő-szinkron előkészítéssel',
    icon: 'fas fa-gas-pump text-emerald-600',
    hasTab: true,
    tabConfig: {
        id: 'plugin_fuel',
        title: 'Tankolási Napló',
        icon: 'fas fa-gas-pump text-emerald-600',
        render: (app) => {
            const view = document.getElementById('moduleView_plugin_fuel');
            if (!view) return;

            view.innerHTML = \`
                <div class="max-w-2xl mx-auto bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
                    <div class="flex items-center justify-between mb-4 border-b pb-3">
                        <div>
                            <h3 class="text-base font-bold text-gray-800 flex items-center gap-2">
                                <i class="fas fa-gas-pump text-emerald-600"></i> Tankolási & Km Napló
                            </h3>
                            <p class="text-xs text-gray-500">Km óra állás, tankolások és benzinkutak nyilvántartása</p>
                        </div>
                        <span class="px-2.5 py-1 bg-emerald-50 text-emerald-700 text-[10px] font-bold rounded-full uppercase border border-emerald-200">
                            Modul v1.2
                        </span>
                    </div>

                    <!-- Új tankolás rögzítése űrlap -->
                    <div class="bg-slate-50/80 p-4 rounded-2xl border border-slate-200/80 mb-5">
                        <h4 class="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                            <i class="fas fa-plus-circle text-emerald-600"></i> Új Tankolás Rögzítése
                        </h4>
                        
                        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                            <div>
                                <label class="block text-[11px] font-bold text-slate-600 mb-1">Aktuális Km állás:</label>
                                <div class="relative">
                                    <input type="text" inputmode="numeric" id="fuelOdoInput" placeholder="pl. 145200" class="w-full p-2.5 border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-emerald-500 focus:outline-none pr-10">
                                    <span class="absolute right-3 top-2.5 text-[10px] text-slate-400 font-mono">km</span>
                                </div>
                            </div>

                            <div>
                                <label class="block text-[11px] font-bold text-slate-600 mb-1">Tankolt Mennyiség:</label>
                                <div class="relative">
                                    <input type="text" inputmode="decimal" id="fuelLitersInput" placeholder="pl. 45.2" class="w-full p-2.5 border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-emerald-500 focus:outline-none pr-10">
                                    <span class="absolute right-3 top-2.5 text-[10px] text-slate-400 font-mono">liter</span>
                                </div>
                            </div>

                            <div>
                                <label class="block text-[11px] font-bold text-slate-600 mb-1">Litervétel Ár:</label>
                                <div class="relative">
                                    <input type="text" inputmode="decimal" id="fuelPriceInput" placeholder="pl. 615" class="w-full p-2.5 border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-emerald-500 focus:outline-none pr-12">
                                    <span class="absolute right-3 top-2.5 text-[10px] text-slate-400 font-mono">Ft/l</span>
                                </div>
                            </div>
                        </div>

                        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                            <div>
                                <label class="block text-[11px] font-bold text-slate-600 mb-1">Fizetési Mód:</label>
                                <select id="fuelPaymentMethodInput" class="w-full p-2.5 border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-white">
                                    <option value="Kártya" selected>💳 Bankkártya</option>
                                    <option value="Készpénz">💵 Készpénz</option>
                                </select>
                            </div>

                            <div>
                                <label class="block text-[11px] font-bold text-slate-600 mb-1">Benzinkút / Helyszín:</label>
                                <input type="text" id="fuelStationInput" placeholder="pl. OMV M3, MOL Budapest, Shell" class="w-full p-2.5 border border-slate-300 rounded-xl text-xs text-slate-800 focus:ring-2 focus:ring-emerald-500 focus:outline-none">
                            </div>

                            <div>
                                <label class="block text-[11px] font-bold text-slate-600 mb-1">Megjegyzés (Opcionális):</label>
                                <input type="text" id="fuelNoteInput" placeholder="pl. Prémium 95, Autópálya út előtt" class="w-full p-2.5 border border-slate-300 rounded-xl text-xs text-slate-800 focus:ring-2 focus:ring-emerald-500 focus:outline-none">
                            </div>
                        </div>

                        <!-- Kiszámított végösszeg kijelző -->
                        <div class="flex items-center justify-between pt-2 border-t border-slate-200/60 mt-2">
                            <div class="text-xs text-slate-500">
                                Várható Fizetendő: <span id="fuelCalcTotal" class="font-extrabold text-emerald-600 font-mono text-sm">0 Ft</span>
                            </div>
                            <button type="button" id="btnSaveFuelEntry" class="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-md shadow-emerald-200 active:scale-95">
                                <i class="fas fa-save"></i> Tankolás Elmentése
                            </button>
                        </div>
                    </div>

                    <!-- Összesített statisztika kártyák -->
                    <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
                        <div class="bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-center">
                            <span class="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Összes Tankolás</span>
                            <span id="fuelStatTotalCost" class="text-lg font-black text-slate-800 font-mono">0 Ft</span>
                        </div>
                        <div class="bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-center">
                            <span class="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Összes Litermennyiség</span>
                            <span id="fuelStatTotalLiters" class="text-lg font-black text-slate-800 font-mono">0 L</span>
                        </div>
                        <div class="bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-center">
                            <span class="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Átl. Átlagfogyasztás</span>
                            <span id="fuelStatAvgCons" class="text-lg font-black text-emerald-600 font-mono">-- l/100km</span>
                        </div>
                    </div>

                    <!-- Tankolások előzménye -->
                    <div class="pt-4 border-t border-slate-100">
                        <div class="flex items-center justify-between mb-3">
                            <h4 class="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                                <i class="fas fa-history text-slate-400"></i> Rögzített Tankolások (Local & Cloud Sync)
                            </h4>
                            <div class="flex items-center gap-3">
                                <button type="button" id="btnSyncCloudFuel" class="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1">
                                    <i class="fas fa-cloud-upload-alt"></i> Felhő Szinkronizálás
                                </button>
                                <button type="button" id="btnClearFuelLogs" class="text-[11px] text-red-500 hover:underline">
                                    Összes törlése
                                </button>
                            </div>
                        </div>
                        <div id="fuelLogsList" class="space-y-2 max-h-60 overflow-y-auto pr-1">
                            <!-- Előzmények lista -->
                        </div>
                    </div>
                </div>
            \`;

            // Logika
            const odoIn = document.getElementById('fuelOdoInput');
            const litersIn = document.getElementById('fuelLitersInput');
            const priceIn = document.getElementById('fuelPriceInput');
            const payMethodIn = document.getElementById('fuelPaymentMethodInput');
            const stationIn = document.getElementById('fuelStationInput');
            const noteIn = document.getElementById('fuelNoteInput');
            const calcTotalEl = document.getElementById('fuelCalcTotal');

            const totalCostEl = document.getElementById('fuelStatTotalCost');
            const totalLitersEl = document.getElementById('fuelStatTotalLiters');
            const avgConsEl = document.getElementById('fuelStatAvgCons');
            const logsListEl = document.getElementById('fuelLogsList');

            let fuelLogs = app.pluginStorage ? app.pluginStorage.getItems('plugin_fuel_logs') : JSON.parse(localStorage.getItem('plugin_fuel_logs') || '[]');

            const updatePlaceholders = () => {
                if (fuelLogs.length > 0) {
                    const sorted = [...fuelLogs].sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
                    const latest = sorted[0];
                    const maxKm = Math.max(...fuelLogs.map(l => l.odo || 0));

                    if (odoIn) odoIn.placeholder = maxKm > 0 ? \`Legutóbbi: \${maxKm} km\` : 'pl. 145200';
                    if (litersIn) litersIn.placeholder = latest && latest.liters ? \`Legutóbbi: \${latest.liters} L\` : 'pl. 45.2';
                    if (priceIn) priceIn.placeholder = latest && latest.price ? \`Legutóbbi: \${latest.price} Ft/l\` : 'pl. 615';
                    if (stationIn) stationIn.placeholder = latest && latest.station ? \`Legutóbbi: \${latest.station}\` : 'pl. OMV M3, MOL Budapest';
                } else {
                    if (odoIn) odoIn.placeholder = 'pl. 145200';
                    if (litersIn) litersIn.placeholder = 'pl. 45.2';
                    if (priceIn) priceIn.placeholder = 'pl. 615';
                    if (stationIn) stationIn.placeholder = 'pl. OMV M3, MOL Budapest';
                }
            };

            const updateCalcTotal = () => {
                const liters = parseFloat((litersIn?.value || '').replace(',', '.')) || 0;
                const price = parseFloat((priceIn?.value || '').replace(',', '.')) || 0;
                const total = Math.round(liters * price);
                if (calcTotalEl) calcTotalEl.textContent = total.toLocaleString('hu-HU') + ' Ft';
                return total;
            };

            const renderStatsAndLogs = () => {
                updatePlaceholders();
                if (!logsListEl) return;

                // Rendezés időrendben (legfrissebb elöl)
                fuelLogs.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));

                let sumCost = 0;
                let sumLiters = 0;

                fuelLogs.forEach(item => {
                    sumCost += item.totalCost || 0;
                    sumLiters += item.liters || 0;
                });

                if (totalCostEl) totalCostEl.textContent = sumCost.toLocaleString('hu-HU') + ' Ft';
                if (totalLitersEl) totalLitersEl.textContent = (Math.round(sumLiters * 10) / 10) + ' L';

                // Átlagfogyasztás számítása ha van legalább 2 tankolás km állással
                const validOdos = fuelLogs.filter(l => l.odo > 0).sort((a, b) => a.odo - b.odo);
                if (validOdos.length >= 2) {
                    const first = validOdos[0];
                    const last = validOdos[validOdos.length - 1];
                    const distDiff = last.odo - first.odo;
                    // Utolsó tankolások literjei az első után
                    let litersAfterFirst = 0;
                    for (let i = 1; i < validOdos.length; i++) {
                        litersAfterFirst += validOdos[i].liters || 0;
                    }
                    if (distDiff > 0 && litersAfterFirst > 0) {
                        const avg = (litersAfterFirst * 100) / distDiff;
                        if (avgConsEl) avgConsEl.textContent = (Math.round(avg * 10) / 10) + ' l/100km';
                    } else {
                        if (avgConsEl) avgConsEl.textContent = '-- l/100km';
                    }
                } else {
                    if (avgConsEl) avgConsEl.textContent = '-- l/100km';
                }

                // Lista renderelés
                if (fuelLogs.length === 0) {
                    logsListEl.innerHTML = '<p class="text-xs text-slate-400 italic py-2">Még nincsenek rögzített tankolási adatok.</p>';
                    return;
                }

                logsListEl.innerHTML = fuelLogs.map((item, idx) => \`
                    <div class="p-3 bg-slate-50 border border-slate-200/80 rounded-xl text-xs flex flex-col sm:flex-row justify-between sm:items-center gap-2">
                        <div>
                            <div class="flex items-center gap-2 font-bold text-slate-800">
                                <span class="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-md font-mono text-[11px]">\${item.odo.toLocaleString('hu-HU')} km</span>
                                <span>\${item.liters} liter</span>
                                <span class="text-slate-400">•</span>
                                <span class="text-slate-600">\${item.price} Ft/l</span>
                            </div>
                            <div class="text-[11px] text-slate-500 mt-1 flex items-center gap-2 flex-wrap">
                                <span class="px-1.5 py-0.5 rounded text-[10px] font-semibold \${item.paymentMethod === 'Készpénz' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'}">
                                    <i class="fas \${item.paymentMethod === 'Készpénz' ? 'fa-money-bill-wave text-amber-600' : 'fa-credit-card text-blue-600'} mr-0.5"></i> \${item.paymentMethod || 'Kártya'}
                                </span>
                                \${item.station ? \`<span class="font-semibold text-slate-700"><i class="fas fa-map-marker-alt text-red-500 mr-0.5"></i> \${item.station}</span>\` : ''}
                                \${item.note ? \`<span class="italic text-slate-500">("\${item.note}")</span>\` : ''}
                                <span class="text-[10px] text-slate-400 font-mono">\${item.date}</span>
                            </div>
                        </div>
                        <div class="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-200">
                            <span class="font-extrabold text-slate-800 font-mono text-sm">\${item.totalCost.toLocaleString('hu-HU')} Ft</span>
                            <button type="button" data-del-fuel="\${idx}" class="text-slate-400 hover:text-red-500 p-1 transition">
                                <i class="fas fa-trash-alt"></i>
                            </button>
                        </div>
                    </div>
                \`).join('');

                // Törlés gombok
                logsListEl.querySelectorAll('[data-del-fuel]').forEach(btn => {
                    btn.addEventListener('click', async () => {
                        const idx = parseInt(btn.getAttribute('data-del-fuel'));
                        const itemToDelete = fuelLogs[idx];
                        if (!itemToDelete) return;

                        let confirmed = false;
                        const notifier = app.hmiNotif || window.app?.hmiNotif;
                        if (notifier && typeof notifier.showConfirm === 'function') {
                            confirmed = await notifier.showConfirm({
                                title: 'Tankolási tétel törlése',
                                message: 'Biztosan törölni szeretnéd ezt a tankolást? (' + itemToDelete.liters + ' L - ' + (itemToDelete.totalCost || 0).toLocaleString('hu-HU') + ' Ft)',
                                type: 'danger',
                                confirmText: 'Törlés',
                                cancelText: 'Mégse'
                            });
                        } else {
                            confirmed = confirm('Biztosan törölni szeretnéd ezt a tankolási tételt?');
                        }

                        if (confirmed) {
                            const deletedItem = fuelLogs.splice(idx, 1)[0];
                            if (app.pluginStorage && deletedItem) {
                                app.pluginStorage.deleteItem('plugin_fuel_logs', deletedItem.id);
                            } else {
                                localStorage.setItem('plugin_fuel_logs', JSON.stringify(fuelLogs));
                            }
                            renderStatsAndLogs();
                            notifier?.showToast('Tankolási rekord törölve!', 'info');
                        }
                    });
                });
            };

            // Input események
            [litersIn, priceIn].forEach(input => {
                input?.addEventListener('input', updateCalcTotal);
            });

            // Mentés gomb
            document.getElementById('btnSaveFuelEntry')?.addEventListener('click', async () => {
                const odoRaw = (odoIn?.value || '').replace(/\s+/g, '');
                const litersRaw = (litersIn?.value || '').replace(',', '.');
                const priceRaw = (priceIn?.value || '').replace(',', '.');

                const odo = parseInt(odoRaw) || 0;
                const liters = parseFloat(litersRaw) || 0;
                const price = parseFloat(priceRaw) || 0;
                const paymentMethod = payMethodIn?.value || 'Kártya';
                const station = (stationIn?.value || '').trim();
                const note = (noteIn?.value || '').trim();

                if (liters <= 0 || price <= 0) {
                    app.hmiNotif?.showToast('Kérlek töltsd ki a tankolt litert és a litervétel árat!', 'warning');
                    return;
                }

                const totalCost = Math.round(liters * price);
                const newLog = {
                    id: window.generateUUID ? window.generateUUID() : 'fuel_' + Date.now(),
                    odo,
                    liters,
                    price,
                    totalCost,
                    paymentMethod,
                    station,
                    note,
                    date: new Date().toLocaleDateString('hu-HU') + ' ' + new Date().toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' }),
                    timestamp: Date.now()
                };

                fuelLogs.unshift(newLog);
                if (app.pluginStorage) {
                    app.pluginStorage.saveItem('plugin_fuel_logs', newLog);
                } else {
                    localStorage.setItem('plugin_fuel_logs', JSON.stringify(fuelLogs));
                }

                // Form ürítése
                if (odoIn) odoIn.value = '';
                if (litersIn) litersIn.value = '';
                if (priceIn) priceIn.value = '';
                if (payMethodIn) payMethodIn.value = 'Kártya';
                if (stationIn) stationIn.value = '';
                if (noteIn) noteIn.value = '';
                updateCalcTotal();

                renderStatsAndLogs();
                app.hmiNotif?.showToast('Tankolási adatok rögzítve a tankolási naplóban!', 'success');

                // Kérdezzük meg, hogy felvegyük-e a költségvetési táblázatba is
                const currentMonth = new Date().toISOString().substring(0, 7);
                let shouldAddToBudget = false;

                const notifier = app.hmiNotif || window.app?.hmiNotif;

                if (notifier && typeof notifier.showConfirm === 'function') {
                    shouldAddToBudget = await notifier.showConfirm({
                        title: 'Átvezetés a költségvetési táblázatba',
                        message: 'Szeretnéd a fizetendő összeget (' + totalCost.toLocaleString('hu-HU') + ' Ft, ' + paymentMethod + ') automatikusan felvenni az aktuális (' + currentMonth + ') havi költségvetési táblázatba ("Tankolás" kategória)?',
                        type: 'info',
                        confirmText: 'Igen, felveszem',
                        cancelText: 'Nem'
                    });
                } else {
                    shouldAddToBudget = confirm('Szeretnéd a fizetendő összeget (' + totalCost.toLocaleString('hu-HU') + ' Ft, ' + paymentMethod + ') automatikusan felvenni az aktuális (' + currentMonth + ') havi költségvetési táblázatba?');
                }

                if (shouldAddToBudget) {
                    try {
                        // 1. Biztosítsuk, hogy az aktuális hónap létezik
                        if (app.months) {
                            if (!app.months.months || !app.months.months.includes(currentMonth)) {
                                await app.months.add(currentMonth);
                                await app.months.load();
                            }
                        }

                        // 2. Kategória keresése vagy létrehozása ("Tankolás")
                        if (app.items) {
                            if (!app.items.items || app.items.items.length === 0) {
                                await app.items.load();
                            }
                            let fuelItem = app.items.items.find(i => 
                                i.name && (
                                    i.name.toLowerCase().includes('tankolá') || 
                                    i.name.toLowerCase().includes('üzemanyag') || 
                                    i.name.toLowerCase().includes('benzin') || 
                                    i.name.toLowerCase().includes('autó')
                                )
                            );

                            if (!fuelItem) {
                                fuelItem = await app.items.add('Tankolás', '#fee2e2');
                            }

                            // 3. Ellenőrizzük a meglévő rész-tételeket az adott cellában
                            const cellBaseKey = fuelItem.id + '_' + currentMonth;
                            let existingEntries = [];
                            if (app.entries && typeof app.entries.getByCellKey === 'function') {
                                existingEntries = await app.entries.getByCellKey(cellBaseKey);
                            }

                            // 4. Megjegyzés és rész-tétel elmentése
                            const noteText = (station ? ('Tankolás: ' + liters + 'L @ ' + price + ' Ft/l (' + station + ')') : ('Tankolás: ' + liters + 'L @ ' + price + ' Ft/l')) + (note ? (' - ' + note) : '');
                            
                            const isNewEntry = !existingEntries || existingEntries.length === 0;
                            const entryCellKey = isNewEntry
                                ? cellBaseKey
                                : cellBaseKey + '_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);

                            const expenseEntry = {
                                cellKey: entryCellKey,
                                itemId: cellBaseKey.split('_')[0],
                                month: cellBaseKey.split('_')[1],
                                amount: totalCost,
                                currency: 'HUF',
                                paymentMethod: paymentMethod,
                                note: noteText,
                                color: 'transparent',
                                timestamp: new Date().toISOString(),
                                updated_at: new Date().toISOString()
                            };

                            await app.entries.saveEntry(expenseEntry);

                            // 5. Táblázat és alkalmazás állapotának újratöltése & nézetek frissítése
                            if (app.items) await app.items.load();
                            if (app.months) await app.months.load();
                            if (app.entries) await app.entries.load();

                            if (typeof app.refreshAllTabs === 'function') {
                                app.refreshAllTabs();
                            } else if (typeof app.refreshUI === 'function') {
                                await app.refreshUI();
                            } else if (app.renderer && typeof app.renderer.renderTable === 'function') {
                                app.renderer.renderTable();
                            } else if (app.renderer && typeof app.renderer.render === 'function') {
                                app.renderer.render();
                            }

                            if (existingEntries && existingEntries.length > 0) {
                                app.hmiNotif?.showToast('Új rész-tételként (' + (existingEntries.length + 1) + '. tétel) rögzítve a havi költségvetésben!', 'success');
                            } else {
                                app.hmiNotif?.showToast('Tankolási költség sikeresen felvéve a költségvetési táblázatba!', 'success');
                            }
                        }
                    } catch (err) {
                        console.error('[FUEL_LOG] Költségvetési táblázatba mentési hiba:', err);
                        app.hmiNotif?.showToast('Hiba történt a költségvetésbe történő átvezetés során.', 'error');
                    }
                }
            });

            // Felhő szinkronizálás gomb akció
            document.getElementById('btnSyncCloudFuel')?.addEventListener('click', async () => {
                let syncedSupa = false;
                if (app.config?.useSupabase && app.cloud?.client) {
                    try {
                        app.hmiNotif?.showToast('Supabase lekérés folyamatban...', 'info');
                        const supaData = await app.cloud.select('plugin_fuel_logs');
                        if (Array.isArray(supaData) && supaData.length > 0) {
                            // Összefésülés a helyi adatokkal ID alapján
                            const map = new Map();
                            fuelLogs.forEach(l => map.set(l.id, l));
                            supaData.forEach(l => map.set(l.id, l));
                            fuelLogs = Array.from(map.values());
                            localStorage.setItem('plugin_fuel_logs', JSON.stringify(fuelLogs));
                            renderStatsAndLogs();
                            syncedSupa = true;
                            app.hmiNotif?.showToast(\`\${supaData.length} rekord sikeresen szinkronizálva Supabase-ből!\`, 'success');
                        } else {
                            // Feltöltjük a helyieket
                            for (const logItem of fuelLogs) {
                                await app.cloud.upsert('plugin_fuel_logs', logItem);
                            }
                            syncedSupa = true;
                            app.hmiNotif?.showToast('Helyi adatok feltöltve Supabase felhőbe!', 'success');
                        }
                    } catch (err) {
                        console.warn('[FUEL_LOG] Supabase szinkronizációs hiba:', err);
                        app.hmiNotif?.showToast('Supabase tábla nem található vagy RLS hiba. Másold be az SQL szkriptet a Súgó menüből!', 'warning');
                    }
                }

                if (!syncedSupa && app.googleDriveSync && typeof app.googleDriveSync.uploadToDrive === 'function') {
                    app.googleDriveSync.uploadToDrive();
                    app.hmiNotif?.showToast('Adatok szinkronizálása a Google Drive felhőbe elindítva!', 'success');
                } else if (!syncedSupa) {
                    app.hmiNotif?.showToast('A Supabase felhő a Beállítások -> Adatkezelés menüben kapcsolható be!', 'info');
                }
            });

            // Összes törlése
            document.getElementById('btnClearFuelLogs')?.addEventListener('click', async () => {
                if (!fuelLogs || fuelLogs.length === 0) {
                    app.hmiNotif?.showToast('Nincs törölhető tankolási rekord!', 'info');
                    return;
                }

                let confirmed = false;
                const notifier = app.hmiNotif || window.app?.hmiNotif;
                if (notifier && typeof notifier.showConfirm === 'function') {
                    confirmed = await notifier.showConfirm({
                        title: 'Összes tankolás törlése',
                        message: 'Biztosan törölni szeretnéd az ÖSSZES rögzített tankolási rekordot? Ez a művelet nem vonható vissza!',
                        type: 'danger',
                        confirmText: 'Összes törlése',
                        cancelText: 'Mégse'
                    });
                } else {
                    confirmed = confirm('Biztosan törölni szeretnéd az összes rögzített tankolást?');
                }

                if (confirmed) {
                    fuelLogs = [];
                    if (app.pluginStorage) {
                        app.pluginStorage.clearAll('plugin_fuel_logs');
                    } else {
                        localStorage.removeItem('plugin_fuel_logs');
                    }
                    renderStatsAndLogs();
                    notifier?.showToast('Összes tankolás törölve!', 'info');
                }
            });

            updateCalcTotal();
            renderStatsAndLogs();
        }
    }
};
`;
