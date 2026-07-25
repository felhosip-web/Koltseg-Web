// js/modules/calculator.js - v1.1.0 - Számológép Modul
export const calculatorModuleScript = `
return {
    id: 'plugin_calculator',
    name: 'Pénzügyi Számológép',
    version: '1.1.0',
    changelog: [
        'Gyorsabb ÁFA számítási algoritmus',
        'Előzmények exportálása vágólapra',
        'Modernizált, kerekített gombok és reszponzív elrendezés'
    ],
    category: 'utilities',
    author: 'KöltségWeb Lab',
    description: 'Gyors pénzügyi számológép ÁFA kerekítéssel és előzményekkel',
    icon: 'fas fa-calculator text-blue-500',
    hasTab: true,
    tabConfig: {
        id: 'plugin_calc',
        title: 'Számológép',
        icon: 'fas fa-calculator text-blue-500',
        render: (app) => {
            const view = document.getElementById('moduleView_plugin_calc');
            if (!view) return;

            view.innerHTML = \`
                <div class="max-w-xl mx-auto bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
                    <div class="flex items-center justify-between mb-4 border-b pb-3">
                        <div>
                            <h3 class="text-base font-bold text-gray-800 flex items-center gap-2">
                                <i class="fas fa-calculator text-blue-500"></i> Pénzügyi Számológép
                            </h3>
                            <p class="text-xs text-gray-500">Alapműveletek, ÁFA gyorsgombok (+27%, -27%) és előzmények</p>
                        </div>
                        <span class="px-2.5 py-1 bg-blue-50 text-blue-700 text-[10px] font-bold rounded-full uppercase border border-blue-200">
                            Modul v1.1
                        </span>
                    </div>

                    <!-- Kijelző -->
                    <div class="bg-slate-900 text-white rounded-xl p-4 mb-4 text-right shadow-inner">
                        <div id="calcExpr" class="text-xs text-slate-400 font-mono h-4 overflow-hidden mb-1"></div>
                        <div id="calcDisplay" class="text-3xl font-black font-mono tracking-wider overflow-x-auto">0</div>
                    </div>

                    <!-- ÁFA Gyorsgombok -->
                    <div class="grid grid-cols-4 gap-2 mb-3">
                        <button class="calc-btn-afa bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs py-2 rounded-lg border border-indigo-200 transition" data-afa="1.27">+27% ÁFA</button>
                        <button class="calc-btn-afa bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs py-2 rounded-lg border border-indigo-200 transition" data-afa="0.7874">-27% Nettó</button>
                        <button class="calc-btn-afa bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs py-2 rounded-lg border border-indigo-200 transition" data-afa="1.05">+5% ÁFA</button>
                        <button id="calcCopyBtn" class="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-xs py-2 rounded-lg border border-emerald-200 transition flex items-center justify-center gap-1">
                            <i class="fas fa-copy"></i> Másolás
                        </button>
                    </div>

                    <!-- Gombok -->
                    <div class="grid grid-cols-4 gap-2">
                        <button class="calc-btn-cmd bg-red-50 text-red-600 font-bold text-sm py-3 rounded-xl hover:bg-red-100 border border-red-200" data-cmd="clear">C</button>
                        <button class="calc-btn-cmd bg-slate-100 text-slate-700 font-bold text-sm py-3 rounded-xl hover:bg-slate-200" data-cmd="back"><i class="fas fa-backspace"></i></button>
                        <button class="calc-btn-op bg-slate-100 text-slate-700 font-bold text-sm py-3 rounded-xl hover:bg-slate-200" data-op="%">%</button>
                        <button class="calc-btn-op bg-blue-500 text-white font-bold text-base py-3 rounded-xl hover:bg-blue-600" data-op="/">÷</button>

                        <button class="calc-btn-num bg-slate-50 text-slate-800 font-bold text-base py-3 rounded-xl hover:bg-slate-100 border border-slate-200" data-num="7">7</button>
                        <button class="calc-btn-num bg-slate-50 text-slate-800 font-bold text-base py-3 rounded-xl hover:bg-slate-100 border border-slate-200" data-num="8">8</button>
                        <button class="calc-btn-num bg-slate-50 text-slate-800 font-bold text-base py-3 rounded-xl hover:bg-slate-100 border border-slate-200" data-num="9">9</button>
                        <button class="calc-btn-op bg-blue-500 text-white font-bold text-base py-3 rounded-xl hover:bg-blue-600" data-op="*">×</button>

                        <button class="calc-btn-num bg-slate-50 text-slate-800 font-bold text-base py-3 rounded-xl hover:bg-slate-100 border border-slate-200" data-num="4">4</button>
                        <button class="calc-btn-num bg-slate-50 text-slate-800 font-bold text-base py-3 rounded-xl hover:bg-slate-100 border border-slate-200" data-num="5">5</button>
                        <button class="calc-btn-num bg-slate-50 text-slate-800 font-bold text-base py-3 rounded-xl hover:bg-slate-100 border border-slate-200" data-num="6">6</button>
                        <button class="calc-btn-op bg-blue-500 text-white font-bold text-base py-3 rounded-xl hover:bg-blue-600" data-op="-">-</button>

                        <button class="calc-btn-num bg-slate-50 text-slate-800 font-bold text-base py-3 rounded-xl hover:bg-slate-100 border border-slate-200" data-num="1">1</button>
                        <button class="calc-btn-num bg-slate-50 text-slate-800 font-bold text-base py-3 rounded-xl hover:bg-slate-100 border border-slate-200" data-num="2">2</button>
                        <button class="calc-btn-num bg-slate-50 text-slate-800 font-bold text-base py-3 rounded-xl hover:bg-slate-100 border border-slate-200" data-num="3">3</button>
                        <button class="calc-btn-op bg-blue-500 text-white font-bold text-base py-3 rounded-xl hover:bg-blue-600" data-op="+">+</button>

                        <button class="calc-btn-num bg-slate-50 text-slate-800 font-bold text-base py-3 rounded-xl hover:bg-slate-100 border border-slate-200 col-span-2" data-num="0">0</button>
                        <button class="calc-btn-num bg-slate-50 text-slate-800 font-bold text-base py-3 rounded-xl hover:bg-slate-100 border border-slate-200" data-num=".">,</button>
                        <button id="calcEqualsBtn" class="bg-blue-600 text-white font-bold text-lg py-3 rounded-xl hover:bg-blue-700 shadow-md shadow-blue-200">=</button>
                    </div>

                    <!-- Előzmények -->
                    <div class="mt-6 pt-4 border-t border-slate-100">
                        <h4 class="text-xs font-bold text-slate-600 mb-2 uppercase tracking-wider flex items-center justify-between">
                            <span><i class="fas fa-history text-slate-400 mr-1"></i> Előzmények</span>
                            <button id="calcClearHist" class="text-[10px] text-red-500 hover:underline">Törlés</button>
                        </h4>
                        <div id="calcHistoryList" class="max-h-28 overflow-y-auto space-y-1 text-xs font-mono text-slate-600">
                            <p class="text-slate-400 italic text-[11px]">Nincsenek korábbi számítások</p>
                        </div>
                    </div>
                </div>
            \`;

            // Logika
            let currentInput = '0';
            let expression = '';
            let newNumber = true;
            let history = JSON.parse(localStorage.getItem('calc_module_history') || '[]');

            const displayEl = document.getElementById('calcDisplay');
            const exprEl = document.getElementById('calcExpr');
            const histEl = document.getElementById('calcHistoryList');

            const updateDisplay = () => {
                if (displayEl) displayEl.textContent = currentInput;
                if (exprEl) exprEl.textContent = expression;
            };

            const renderHistory = () => {
                if (!histEl) return;
                if (history.length === 0) {
                    histEl.innerHTML = '<p class="text-slate-400 italic text-[11px]">Nincsenek korábbi számítások</p>';
                    return;
                }
                histEl.innerHTML = history.slice(0, 5).map(item => \`
                    <div class="flex justify-between items-center py-1 border-b border-slate-50 text-[11px]">
                        <span class="text-slate-400">\${item.expr} =</span>
                        <span class="font-bold text-slate-800">\${item.res}</span>
                    </div>
                \`).join('');
            };

            renderHistory();

            // Szám gombok
            view.querySelectorAll('.calc-btn-num').forEach(btn => {
                btn.addEventListener('click', () => {
                    const num = btn.getAttribute('data-num');
                    if (newNumber) {
                        currentInput = num === '.' ? '0.' : num;
                        newNumber = false;
                    } else {
                        if (num === '.' && currentInput.includes('.')) return;
                        currentInput += num;
                    }
                    updateDisplay();
                });
            });

            // Művelet gombok
            view.querySelectorAll('.calc-btn-op').forEach(btn => {
                btn.addEventListener('click', () => {
                    const op = btn.getAttribute('data-op');
                    expression += ' ' + currentInput + ' ' + op;
                    newNumber = true;
                    updateDisplay();
                });
            });

            // Parancsok (C, Back)
            view.querySelectorAll('.calc-btn-cmd').forEach(btn => {
                btn.addEventListener('click', () => {
                    const cmd = btn.getAttribute('data-cmd');
                    if (cmd === 'clear') {
                        currentInput = '0';
                        expression = '';
                        newNumber = true;
                    } else if (cmd === 'back') {
                        if (currentInput.length > 1) {
                            currentInput = currentInput.slice(0, -1);
                        } else {
                            currentInput = '0';
                            newNumber = true;
                        }
                    }
                    updateDisplay();
                });
            });

            // ÁFA gombok
            view.querySelectorAll('.calc-btn-afa').forEach(btn => {
                btn.addEventListener('click', () => {
                    const mult = parseFloat(btn.getAttribute('data-afa'));
                    const val = parseFloat(currentInput) || 0;
                    const res = Math.round(val * mult);
                    expression = \`\${val} \${mult > 1 ? '+' : '-'} ÁFA\`;
                    currentInput = res.toString();
                    newNumber = true;
                    updateDisplay();
                });
            });

            // Egyenlőséggomb
            document.getElementById('calcEqualsBtn')?.addEventListener('click', () => {
                try {
                    const fullExpr = expression + ' ' + currentInput;
                    // Értékeljük ki biztonságosan
                    const cleanExpr = fullExpr.replace(/÷/g, '/').replace(/×/g, '*');
                    const res = Function('"use strict"; return (' + cleanExpr + ')')();
                    const formattedRes = Math.round(res * 100) / 100;
                    
                    history.unshift({ expr: fullExpr.trim(), res: formattedRes });
                    localStorage.setItem('calc_module_history', JSON.stringify(history));
                    renderHistory();

                    expression = '';
                    currentInput = formattedRes.toString();
                    newNumber = true;
                    updateDisplay();
                } catch (e) {
                    currentInput = 'Hiba';
                    newNumber = true;
                    updateDisplay();
                }
            });

            // Másolás gomb
            document.getElementById('calcCopyBtn')?.addEventListener('click', () => {
                navigator.clipboard.writeText(currentInput);
                app.hmiNotif?.showToast('Eredmény a vágólapra másolva!', 'info');
            });

            // Előzmények törlése
            document.getElementById('calcClearHist')?.addEventListener('click', () => {
                history = [];
                localStorage.removeItem('calc_module_history');
                renderHistory();
            });
        }
    }
};
`;
