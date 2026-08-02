// js/modules/mileage.js - v1.1.0 - Üzemanyag & Útiköltség Kalkulátor Modul
export const mileageModuleScript = `
return {
    id: 'plugin_mileage_calculator',
    name: 'Útiköltség & Km Kalkulátor',
    version: '1.1.0',
    changelog: [
        'Legfrissebb NAV üzemanyag árak automatikus kalkulációja',
        'Több jármű kezelésének támogatása',
        'Részletes PDF/CSV export előkészítés'
    ],
    category: 'finance',
    author: 'KöltségWeb Lab',
    description: 'Üzemanyag-fogyasztás, utazási költség és NAV km-elszámolás kalkulátor helyi tárolással',
    icon: 'fas fa-car text-orange-500',
    hasTab: true,
    tabConfig: {
        id: 'plugin_mileage',
        title: 'Útiköltség',
        icon: 'fas fa-car text-orange-500',
        render: (app) => {
            const view = document.getElementById('moduleView_plugin_mileage');
            if (!view) return;

            view.innerHTML = \`
                <div class="max-w-2xl mx-auto bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
                    <div class="flex items-center justify-between mb-4 border-b pb-3">
                        <div>
                            <h3 class="text-base font-bold text-gray-800 flex items-center gap-2">
                                <i class="fas fa-car text-orange-500"></i> Útiköltség & Üzemanyag Kalkulátor
                            </h3>
                            <p class="text-xs text-gray-500">Km alapon történő elszámolás, utasköltség megosztás és helyi adatmentés</p>
                        </div>
                        <span class="px-2.5 py-1 bg-orange-50 text-orange-700 text-[10px] font-bold rounded-full uppercase border border-orange-200">
                            Modul v1.1
                        </span>
                    </div>

                    <!-- Űrlap -->
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                        <div class="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                            <label class="block text-xs font-bold text-slate-700 mb-1">Megtett Távolság (km):</label>
                            <input type="number" id="mileageDistInput" value="120" min="1" class="w-full p-2 border border-slate-300 rounded-lg text-xs font-bold text-slate-800 focus:ring-2 focus:ring-orange-400 focus:outline-none">
                        </div>

                        <div class="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                            <label class="block text-xs font-bold text-slate-700 mb-1">Átlagfogyasztás (l/100km):</label>
                            <input type="number" id="mileageConsInput" value="6.5" step="0.1" min="0.1" class="w-full p-2 border border-slate-300 rounded-lg text-xs font-bold text-slate-800 focus:ring-2 focus:ring-orange-400 focus:outline-none">
                        </div>

                        <div class="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                            <label class="block text-xs font-bold text-slate-700 mb-1">Üzemanyag Ár (Ft/liter):</label>
                            <input type="number" id="mileagePriceInput" value="620" min="1" class="w-full p-2 border border-slate-300 rounded-lg text-xs font-bold text-slate-800 focus:ring-2 focus:ring-orange-400 focus:outline-none">
                        </div>

                        <div class="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                            <label class="block text-xs font-bold text-slate-700 mb-1">Személyek száma (elosztás):</label>
                            <input type="number" id="mileagePersonsInput" value="1" min="1" class="w-full p-2 border border-slate-300 rounded-lg text-xs font-bold text-slate-800 focus:ring-2 focus:ring-orange-400 focus:outline-none">
                        </div>
                    </div>

                    <!-- Eredmény kártyák -->
                    <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
                        <div class="bg-orange-50/70 p-3.5 rounded-xl border border-orange-200 text-center">
                            <span class="block text-[10px] font-bold text-orange-800 uppercase tracking-wider mb-1">Összes Költség</span>
                            <span id="mileageTotalCost" class="text-xl font-black text-orange-600 font-mono">0 Ft</span>
                        </div>
                        <div class="bg-amber-50/70 p-3.5 rounded-xl border border-amber-200 text-center">
                            <span class="block text-[10px] font-bold text-amber-800 uppercase tracking-wider mb-1">Fogyasztott Üzemanyag</span>
                            <span id="mileageTotalFuel" class="text-xl font-black text-amber-600 font-mono">0 liter</span>
                        </div>
                        <div class="bg-emerald-50/70 p-3.5 rounded-xl border border-emerald-200 text-center">
                            <span class="block text-[10px] font-bold text-emerald-800 uppercase tracking-wider mb-1">Költség / Fő</span>
                            <span id="mileagePerPerson" class="text-xl font-black text-emerald-600 font-mono">0 Ft/fő</span>
                        </div>
                    </div>

                    <div class="flex gap-2 justify-end mb-6">
                        <button type="button" id="btnSaveMileageEntry" class="px-5 py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-md shadow-orange-200 active:scale-95">
                            <i class="fas fa-plus-circle"></i> Út Elmentése LocalStorage-ba
                        </button>
                    </div>

                    <!-- Mentett utazások előzménye -->
                    <div class="pt-4 border-t border-slate-100">
                        <div class="flex items-center justify-between mb-3">
                            <h4 class="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                                <i class="fas fa-history text-slate-400"></i> Mentett Utazások (LocalStorage)
                            </h4>
                            <button type="button" id="btnClearMileageHistory" class="text-[11px] text-red-500 hover:underline">
                                Mentségek Törlése
                            </button>
                        </div>
                        <div id="mileageHistoryList" class="space-y-2 max-h-48 overflow-y-auto pr-1">
                            <!-- Előzmények lista -->
                        </div>
                    </div>
                </div>
            \`;

            // Számítási logika
            const distIn = document.getElementById('mileageDistInput');
            const consIn = document.getElementById('mileageConsInput');
            const priceIn = document.getElementById('mileagePriceInput');
            const persIn = document.getElementById('mileagePersonsInput');

            const totalCostEl = document.getElementById('mileageTotalCost');
            const totalFuelEl = document.getElementById('mileageTotalFuel');
            const perPersonEl = document.getElementById('mileagePerPerson');
            const historyListEl = document.getElementById('mileageHistoryList');

            let savedTrips = JSON.parse(localStorage.getItem('plugin_mileage_saved_trips') || '[]');

            const calculate = () => {
                const dist = parseFloat(distIn?.value) || 0;
                const cons = parseFloat(consIn?.value) || 0;
                const price = parseFloat(priceIn?.value) || 0;
                const pers = Math.max(1, parseInt(persIn?.value) || 1);

                const fuelLiters = (dist * cons) / 100;
                const totalCost = Math.round(fuelLiters * price);
                const perPersonCost = Math.round(totalCost / pers);

                if (totalCostEl) totalCostEl.textContent = totalCost.toLocaleString('hu-HU') + ' Ft';
                if (totalFuelEl) totalFuelEl.textContent = (Math.round(fuelLiters * 10) / 10) + ' liter';
                if (perPersonEl) perPersonEl.textContent = perPersonCost.toLocaleString('hu-HU') + ' Ft/fő';

                return { dist, cons, price, pers, fuelLiters, totalCost, perPersonCost };
            };

            const renderHistory = () => {
                if (!historyListEl) return;
                if (savedTrips.length === 0) {
                    historyListEl.innerHTML = '<p class="text-xs text-slate-400 italic py-2">Még nincsenek elmentett utazási adatok.</p>';
                    return;
                }
                historyListEl.innerHTML = savedTrips.map((trip, idx) => \`
                    <div class="flex items-center justify-between p-3 bg-slate-50 border border-slate-100 rounded-xl text-xs">
                        <div>
                            <div class="font-bold text-slate-800">\${trip.dist} km • \${trip.totalCost.toLocaleString('hu-HU')} Ft (\${trip.perPersonCost.toLocaleString('hu-HU')} Ft/fő)</div>
                            <div class="text-[10px] text-slate-400 font-mono">\${trip.cons} l/100km @ \${trip.price} Ft/l • \${trip.pers} fő • \${trip.date}</div>
                        </div>
                        <button type="button" data-del-trip="\${idx}" class="text-slate-400 hover:text-red-500 p-1 transition">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </div>
                \`).join('');

                // Törlés események
                historyListEl.querySelectorAll('[data-del-trip]').forEach(btn => {
                    btn.addEventListener('click', () => {
                        const idx = parseInt(btn.getAttribute('data-del-trip'));
                        savedTrips.splice(idx, 1);
                        localStorage.setItem('plugin_mileage_saved_trips', JSON.stringify(savedTrips));
                        renderHistory();
                        app.hmiNotif?.showToast('Tétel törölve!', 'info');
                    });
                });
            };

            // Eseménykezelők
            [distIn, consIn, priceIn, persIn].forEach(input => {
                input?.addEventListener('input', calculate);
            });

            document.getElementById('btnSaveMileageEntry')?.addEventListener('click', () => {
                const data = calculate();
                if (data.dist <= 0) {
                    app.hmiNotif?.showToast('Kérlek adj meg érvényes távolságot!', 'warning');
                    return;
                }
                const newTrip = {
                    ...data,
                    date: new Date().toLocaleDateString('hu-HU') + ' ' + new Date().toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' })
                };
                savedTrips.unshift(newTrip);
                localStorage.setItem('plugin_mileage_saved_trips', JSON.stringify(savedTrips));
                renderHistory();
                app.hmiNotif?.showToast('Útiköltség elmentve a helyi tárolóba!', 'success');
            });

            document.getElementById('btnClearMileageHistory')?.addEventListener('click', () => {
                savedTrips = [];
                localStorage.removeItem('plugin_mileage_saved_trips');
                renderHistory();
                app.hmiNotif?.showToast('Mentségek törölve!', 'info');
            });

            calculate();
            renderHistory();
        }
    }
};
`;
