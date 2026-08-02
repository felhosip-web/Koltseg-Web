// js/modules/shopping-list.js - v1.0.0 - Intelligens Bevásárlólista Modul
export const shoppingListModuleScript = `
return {
    id: 'plugin_shopping_list',
    name: 'Intelligens Bevásárlólista',
    version: '1.0.0',
    changelog: [
        'Első kiadás',
        'Pipálható tételek helyi tárolással',
        'Gyors hozzáadás és kategória szerinti szűrés',
        'Összeg kalkuláció és kijelöltek törlése',
        'Egyedi költségkeret figyelő és vágólapra másolás'
    ],
    category: 'utilities',
    author: 'KöltségWeb Lab',
    description: 'Interaktív, kategóriákra bontható és pipálható bevásárlólista összeghatár számolással, gyors hozzáadás sablonokkal és helyi tárolással.',
    icon: 'fas fa-shopping-basket text-rose-500',
    hasTab: true,
    tabConfig: {
        id: 'plugin_shopping',
        title: 'Bevásárlólista',
        icon: 'fas fa-shopping-basket text-rose-500',
        render: (app) => {
            const view = document.getElementById('moduleView_plugin_shopping');
            if (!view) return;

            // Load saved data or initialize defaults
            let items = JSON.parse(localStorage.getItem('plugin_shopping_list_items') || '[]');
            let budget = parseInt(localStorage.getItem('plugin_shopping_list_budget') || '15000');

            const presets = [
                { name: 'Tej', cat: 'élelmiszer', price: 450, unit: '1 l' },
                { name: 'Kenyér', cat: 'élelmiszer', price: 650, unit: '1 db' },
                { name: 'Tojás', cat: 'élelmiszer', price: 750, unit: '10 db' },
                { name: 'Sajt', cat: 'élelmiszer', price: 1200, unit: '30 dkg' },
                { name: 'Csirkemell', cat: 'élelmiszer', price: 1900, unit: '1 kg' },
                { name: 'Alma', cat: 'élelmiszer', price: 550, unit: '1 kg' },
                { name: 'Mosószer', cat: 'háztartás', price: 2400, unit: '1 db' },
                { name: 'Tusfürdő', cat: 'kozmetikum', price: 950, unit: '1 db' },
                { name: 'Ásványvíz', cat: 'élelmiszer', price: 180, unit: '1.5 l' },
                { name: 'Kávé', cat: 'élelmiszer', price: 1400, unit: '25 dkg' }
            ];

            let activeFilter = 'all';

            const renderUI = () => {
                // Calculate summaries
                const totalEstimated = items.reduce((sum, item) => sum + (item.price * item.qty), 0);
                const totalChecked = items.filter(item => item.checked).reduce((sum, item) => sum + (item.price * item.qty), 0);
                const budgetPercent = Math.min(Math.round((totalEstimated / budget) * 100), 100);
                
                // Color formatting for progress bar and warnings
                let progressColorClass = 'bg-rose-500';
                let budgetTextClass = 'text-slate-600';
                if (totalEstimated > budget) {
                    progressColorClass = 'bg-red-600 animate-pulse';
                    budgetTextClass = 'text-red-600 font-extrabold';
                } else if (budgetPercent > 80) {
                    progressColorClass = 'bg-amber-500';
                } else {
                    progressColorClass = 'bg-rose-500';
                }

                // Filtered items
                const filteredItems = items.filter(item => {
                    if (activeFilter === 'all') return true;
                    if (activeFilter === 'checked') return item.checked;
                    if (activeFilter === 'active') return !item.checked;
                    return item.cat === activeFilter;
                });

                view.innerHTML = \`
                    <div class="max-w-2xl mx-auto bg-slate-50/40 rounded-3xl border border-slate-200/60 p-6 shadow-sm">
                        
                        <!-- Header -->
                        <div class="flex items-center justify-between mb-6 border-b border-slate-200 pb-4">
                            <div class="flex items-center gap-3">
                                <div class="p-3 bg-rose-50 text-rose-600 rounded-2xl shadow-sm">
                                    <i class="fas fa-shopping-basket text-xl"></i>
                                </div>
                                <div class="text-left">
                                    <h3 class="text-base font-extrabold text-slate-800">Intelligens Bevásárlólista</h3>
                                    <p class="text-xs text-slate-500">Tervezd meg a vásárlást és tartsd kézben a költségkeretet!</p>
                                </div>
                            </div>
                            <span class="px-3 py-1 bg-rose-50 border border-rose-100 text-rose-700 text-[10px] font-black rounded-full uppercase tracking-wider">
                                Bővítmény v1.0
                            </span>
                        </div>

                        <!-- Budget Tracker widget -->
                        <div class="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm mb-6 text-left">
                            <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-3 gap-2">
                                <div>
                                    <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Költségvetési Korlát</span>
                                    <div class="flex items-center gap-2 mt-0.5">
                                        <span class="text-lg font-black text-slate-800" id="displayBudgetVal">\${budget.toLocaleString('hu-HU')} Ft</span>
                                        <button id="btnEditBudget" class="text-slate-400 hover:text-slate-600 text-xs p-1" title="Költségkeret módosítása">
                                            <i class="fas fa-edit"></i>
                                        </button>
                                        <div id="budgetInputContainer" class="hidden flex items-center gap-1">
                                            <input type="number" id="budgetLimitInput" value="\${budget}" class="w-24 p-1 text-xs font-bold border rounded focus:outline-none focus:ring-1 focus:ring-rose-400">
                                            <button id="btnSaveBudget" class="px-2 py-1 bg-rose-500 hover:bg-rose-600 text-white rounded text-[10px] font-bold">Mentés</button>
                                        </div>
                                    </div>
                                </div>
                                <div class="text-right sm:text-right">
                                    <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Becsült teljes összeg</span>
                                    <span class="text-sm font-black \${budgetTextClass}">\${totalEstimated.toLocaleString('hu-HU')} Ft</span>
                                </div>
                            </div>

                            <!-- Progress Bar -->
                            <div class="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden mb-2">
                                <div class="h-full \${progressColorClass} transition-all duration-500" style="width: \${budgetPercent}%"></div>
                            </div>

                            <div class="flex justify-between items-center text-[11px] text-slate-500 font-semibold">
                                <span>Kosár tartalma: \${totalChecked.toLocaleString('hu-HU')} Ft</span>
                                <span>\${budgetPercent}% kihasználtság</span>
                            </div>
                        </div>

                        <!-- Add Item Form -->
                        <div class="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm mb-6 text-left">
                            <h4 class="text-xs font-extrabold text-slate-700 mb-3 uppercase tracking-wider">Új tétel hozzáadása</h4>
                            <form id="addShoppingItemForm" class="grid grid-cols-12 gap-2.5">
                                <div class="col-span-12 sm:col-span-4">
                                    <input type="text" id="itemName" placeholder="Tétel megnevezése (pl. Kenyér)" required class="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-300">
                                </div>
                                <div class="col-span-6 sm:col-span-2">
                                    <input type="text" id="itemQty" value="1 db" placeholder="Mennyiség" required class="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-300">
                                </div>
                                <div class="col-span-6 sm:col-span-2">
                                    <input type="number" id="itemPrice" placeholder="Egységár (Ft)" required class="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-300">
                                </div>
                                <div class="col-span-12 sm:col-span-2">
                                    <select id="itemCat" class="w-full px-2.5 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-300 bg-white">
                                        <option value="élelmiszer">Élelmiszer</option>
                                        <option value="háztartás">Háztartás</option>
                                        <option value="kozmetikum">Kozmetikum</option>
                                        <option value="egyéb">Egyéb</option>
                                    </select>
                                </div>
                                <button type="submit" class="col-span-12 sm:col-span-2 py-2 bg-rose-500 hover:bg-rose-600 text-white font-bold text-xs rounded-xl transition shadow-sm flex items-center justify-center gap-1.5 active:scale-95">
                                    <i class="fas fa-plus"></i> Hozzáad
                                </button>
                            </form>

                            <!-- Presets -->
                            <div class="mt-4 pt-3 border-t border-slate-100">
                                <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">Gyors felvitel sablonokból:</span>
                                <div class="flex flex-wrap gap-1.5">
                                    \${presets.map(p => \`
                                        <button type="button" data-preset-name="\${p.name}" data-preset-cat="\${p.cat}" data-preset-price="\${p.price}" data-preset-unit="\${p.unit}" class="btn-shopping-preset px-2.5 py-1 bg-slate-50 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 border border-slate-200 text-slate-600 text-[11px] font-semibold rounded-lg transition active:scale-95 flex items-center gap-1">
                                            <span>\${p.name}</span>
                                            <span class="text-[9px] text-slate-400 font-normal">(\${p.price} Ft)</span>
                                        </button>
                                    \`).join('')}
                                </div>
                            </div>
                        </div>

                        <!-- Filters & Bulk Operations -->
                        <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
                            <div class="flex flex-wrap gap-1">
                                <button type="button" data-filter="all" class="btn-shop-filter px-3 py-1.5 text-xs font-bold rounded-xl transition border \${activeFilter === 'all' ? 'bg-rose-500 text-white border-rose-500 shadow-sm' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50' }">Mind</button>
                                <button type="button" data-filter="active" class="btn-shop-filter px-3 py-1.5 text-xs font-bold rounded-xl transition border \${activeFilter === 'active' ? 'bg-rose-500 text-white border-rose-500 shadow-sm' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50' }">Megveendő</button>
                                <button type="button" data-filter="checked" class="btn-shop-filter px-3 py-1.5 text-xs font-bold rounded-xl transition border \${activeFilter === 'checked' ? 'bg-rose-500 text-white border-rose-500 shadow-sm' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50' }">Megvéve</button>
                                <button type="button" data-filter="élelmiszer" class="btn-shop-filter px-3 py-1.5 text-xs font-bold rounded-xl transition border \${activeFilter === 'élelmiszer' ? 'bg-rose-500 text-white border-rose-500 shadow-sm' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50' }">Élelmiszer</button>
                                <button type="button" data-filter="háztartás" class="btn-shop-filter px-3 py-1.5 text-xs font-bold rounded-xl transition border \${activeFilter === 'háztartás' ? 'bg-rose-500 text-white border-rose-500 shadow-sm' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50' }">Háztartás</button>
                            </div>

                            <div class="flex gap-1.5">
                                <button id="btnCopyShoppingList" type="button" class="px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs rounded-xl border border-indigo-100 transition active:scale-95 flex items-center gap-1" title="Lista másolása a vágólapra">
                                    <i class="fas fa-copy"></i> Másolás
                                </button>
                                <button id="btnClearCheckedShopping" type="button" class="px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 font-bold text-xs rounded-xl border border-amber-100 transition active:scale-95">
                                    Kosár ürítése
                                </button>
                                <button id="btnClearAllShopping" type="button" class="px-2.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 font-bold text-xs rounded-xl border border-red-100 transition active:scale-95">
                                    Összes törlése
                                </button>
                            </div>
                        </div>

                        <!-- Items List -->
                        <div class="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden text-left">
                            <div class="divide-y divide-slate-100" id="shoppingItemsContainer">
                                \${filteredItems.length === 0 ? \`
                                    <div class="p-8 text-center text-slate-400">
                                        <i class="fas fa-clipboard-list text-3xl mb-2 text-slate-300"></i>
                                        <p class="text-xs font-bold">Nincsenek tételek a listában.</p>
                                        <p class="text-[10px] text-slate-400 mt-0.5">Adja hozzá az első terméket a fenti űrlappal vagy sablonnal!</p>
                                    </div>
                                \` : filteredItems.map((item, index) => {
                                    // Parse multiplier for total
                                    const parsedQty = parseFloat(item.qty) || 1;
                                    const totalItemPrice = item.price * parsedQty;

                                    // Category color map
                                    let catIcon = 'fa-tag';
                                    let catColor = 'text-slate-400 bg-slate-50 border-slate-100';
                                    if (item.cat === 'élelmiszer') {
                                        catIcon = 'fa-apple-alt';
                                        catColor = 'text-rose-600 bg-rose-50 border-rose-100';
                                    } else if (item.cat === 'háztartás') {
                                        catIcon = 'fa-home';
                                        catColor = 'text-blue-600 bg-blue-50 border-blue-100';
                                    } else if (item.cat === 'kozmetikum') {
                                        catIcon = 'fa-sparkles';
                                        catColor = 'text-purple-600 bg-purple-50 border-purple-100';
                                    }

                                    return \`
                                        <div class="p-3.5 flex items-center justify-between hover:bg-slate-50/50 transition group \${item.checked ? 'bg-slate-50/30' : ''}" data-item-id="\${item.id}">
                                            <div class="flex items-center gap-3">
                                                <!-- Checkbox wrapper -->
                                                <button type="button" class="btn-toggle-item flex items-center justify-center w-5 h-5 rounded-md border-2 transition-all \${item.checked ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-300 hover:border-rose-400 bg-white' }">
                                                    \${item.checked ? '<i class="fas fa-check text-[10px] font-black"></i>' : ''}
                                                </button>
                                                
                                                <div class="text-left">
                                                    <span class="text-xs font-bold transition-all duration-300 \${item.checked ? 'line-through text-slate-400 decoration-slate-400/80 decoration-2' : 'text-slate-800'}">\${item.name}</span>
                                                    <div class="flex items-center gap-1.5 mt-0.5">
                                                        <span class="px-1.5 py-0.5 text-[9px] font-black rounded uppercase border \${catColor} flex items-center gap-1">
                                                            <i class="fas \${catIcon} text-[8px]"></i> \${item.cat}
                                                        </span>
                                                        <span class="text-[10px] text-slate-400 font-semibold">\${item.qty} × \${item.price.toLocaleString('hu-HU')} Ft</span>
                                                    </div>
                                                </div>
                                            </div>

                                            <div class="flex items-center gap-3">
                                                <span class="text-xs font-black text-slate-700 font-mono">\${totalItemPrice.toLocaleString('hu-HU')} Ft</span>
                                                <button type="button" class="btn-delete-item text-slate-300 hover:text-red-500 transition opacity-0 group-hover:opacity-100 p-1 text-xs" data-id="\${item.id}">
                                                    <i class="fas fa-trash"></i>
                                                </button>
                                            </div>
                                        </div>
                                    \`;
                                }).join('')}
                            </div>
                        </div>

                    </div>
                \`;

                // Add event listeners for dynamic controls
                
                // Toggle edit budget view
                document.getElementById('btnEditBudget')?.addEventListener('click', () => {
                    document.getElementById('displayBudgetVal').classList.add('hidden');
                    document.getElementById('btnEditBudget').classList.add('hidden');
                    document.getElementById('budgetInputContainer').classList.remove('hidden');
                    document.getElementById('budgetLimitInput').focus();
                });

                document.getElementById('btnSaveBudget')?.addEventListener('click', () => {
                    const val = parseInt(document.getElementById('budgetLimitInput').value) || 0;
                    budget = val;
                    localStorage.setItem('plugin_shopping_list_budget', budget);
                    renderUI();
                    if (app.hmiNotif) app.hmiNotif.showToast('Költségkeret sikeresen módosítva!', 'success');
                });

                // Toggle checked status
                view.querySelectorAll('.btn-toggle-item').forEach((btn) => {
                    btn.addEventListener('click', () => {
                        const row = btn.closest('[data-item-id]');
                        const itemId = row.getAttribute('data-item-id');
                        const index = items.findIndex(i => i.id === itemId);
                        if (index !== -1) {
                            items[index].checked = !items[index].checked;
                            localStorage.setItem('plugin_shopping_list_items', JSON.stringify(items));
                            renderUI();
                        }
                    });
                });

                // Delete individual item
                view.querySelectorAll('.btn-delete-item').forEach((btn) => {
                    btn.addEventListener('click', () => {
                        const itemId = btn.getAttribute('data-id');
                        items = items.filter(i => i.id !== itemId);
                        localStorage.setItem('plugin_shopping_list_items', JSON.stringify(items));
                        renderUI();
                    });
                });

                // Set filter
                view.querySelectorAll('.btn-shop-filter').forEach(btn => {
                    btn.addEventListener('click', () => {
                        activeFilter = btn.getAttribute('data-filter');
                        renderUI();
                    });
                });

                // Clear Checked items (Kosár ürítése)
                document.getElementById('btnClearCheckedShopping')?.addEventListener('click', () => {
                    const beforeCount = items.length;
                    items = items.filter(i => !i.checked);
                    localStorage.setItem('plugin_shopping_list_items', JSON.stringify(items));
                    renderUI();
                    if (app.hmiNotif) {
                        const deleted = beforeCount - items.length;
                        if (deleted > 0) app.hmiNotif.showToast(\`🗑️ \${deleted} megvásárolt tétel törölve!\`, 'success');
                        else app.hmiNotif.showToast('Nincs megjelölt tétel a kosárban.', 'info');
                    }
                });

                // Clear All items (Összes törlése)
                document.getElementById('btnClearAllShopping')?.addEventListener('click', () => {
                    if (items.length === 0) return;
                    if (confirm('Biztosan törölni szeretnéd a bevásárlólista összes elemét?')) {
                        items = [];
                        localStorage.setItem('plugin_shopping_list_items', JSON.stringify(items));
                        renderUI();
                        if (app.hmiNotif) app.hmiNotif.showToast('🗑️ Bevásárlólista kiürítve!', 'success');
                    }
                });

                // Copy Shopping List to Clipboard
                document.getElementById('btnCopyShoppingList')?.addEventListener('click', () => {
                    if (items.length === 0) {
                        if (app.hmiNotif) app.hmiNotif.showToast('A lista üres, nincs mit másolni.', 'info');
                        return;
                    }
                    let text = '🛒 *KÖLTSÉGWEB BEVÁSÁRLÓLISTA* 🛒\\n\\n';
                    items.forEach(item => {
                        const mark = item.checked ? '✅' : '⬜';
                        text += \`\${mark} *\${item.name}* (\${item.qty}) - \${item.price.toLocaleString('hu-HU')} Ft\\n\`;
                    });
                    const est = items.reduce((sum, item) => sum + (item.price * (parseFloat(item.qty) || 1)), 0);
                    text += \`\\n💰 *Becsült összesen:* \${est.toLocaleString('hu-HU')} Ft\\n📌 Készült a KöltségWeb Bővítménnyel\`;

                    navigator.clipboard.writeText(text).then(() => {
                        if (app.hmiNotif) app.hmiNotif.showToast('📋 Lista vágólapra másolva!', 'success');
                    }).catch(err => {
                        console.error('Copy failed: ', err);
                    });
                });

                // Preset click listeners
                view.querySelectorAll('.btn-shopping-preset').forEach(btn => {
                    btn.addEventListener('click', () => {
                        const name = btn.getAttribute('data-preset-name');
                        const cat = btn.getAttribute('data-preset-cat');
                        const price = parseInt(btn.getAttribute('data-preset-price')) || 0;
                        const unit = btn.getAttribute('data-preset-unit');

                        const newItem = {
                            id: 'item_' + Date.now() + Math.random().toString(36).substr(2, 5),
                            name: name,
                            qty: unit,
                            price: price,
                            cat: cat,
                            checked: false
                        };

                        items.push(newItem);
                        localStorage.setItem('plugin_shopping_list_items', JSON.stringify(items));
                        renderUI();

                        if (app.hmiNotif) app.hmiNotif.showToast(\`➕ \${name} hozzáadva a bevásárlólistához!\`, 'success');
                    });
                });

                // Form submit handler
                document.getElementById('addShoppingItemForm')?.addEventListener('submit', (e) => {
                    e.preventDefault();
                    const name = document.getElementById('itemName').value.trim();
                    const qty = document.getElementById('itemQty').value.trim() || '1 db';
                    const price = parseInt(document.getElementById('itemPrice').value) || 0;
                    const cat = document.getElementById('itemCat').value;

                    if (!name) return;

                    const newItem = {
                        id: 'item_' + Date.now(),
                        name: name,
                        qty: qty,
                        price: price,
                        cat: cat,
                        checked: false
                    };

                    items.push(newItem);
                    localStorage.setItem('plugin_shopping_list_items', JSON.stringify(items));
                    
                    // Reset input fields
                    document.getElementById('itemName').value = '';
                    document.getElementById('itemQty').value = '1 db';
                    document.getElementById('itemPrice').value = '';
                    
                    renderUI();

                    if (app.hmiNotif) app.hmiNotif.showToast(\`➕ \${name} hozzáadva a bevásárlólistához!\`, 'success');
                });
            };

            // Run initial render
            renderUI();
        }
    }
};
`;
