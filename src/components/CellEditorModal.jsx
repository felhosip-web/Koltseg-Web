import React, { useEffect, useRef } from 'react';

export default function CellEditorModal() {
    const amountInputRef = useRef(null);

    useEffect(() => {
        const modalRoot = document.getElementById('costAppCellEditorRoot');
        if (!modalRoot) return undefined;

        const openModal = () => {
            const controller = window.app?.uiController?.cellModal;
            controller?.resetForm();
            controller?.refreshList();

            if (window.app?.modalManager) {
                window.app.modalManager.open('cellEditorModal');
            } else {
                document.getElementById('cellEditorModal')?.classList.remove('hidden');
            }

            amountInputRef.current?.focus();
        };
        const closeModal = () => {
            if (window.app?.modalManager) {
                window.app.modalManager.close('cellEditorModal');
            } else {
                document.getElementById('cellEditorModal')?.classList.add('hidden');
            }
        };

        modalRoot.addEventListener('cell-editor-open', openModal);
        modalRoot.addEventListener('cell-editor-close', closeModal);

        return () => {
            modalRoot.removeEventListener('cell-editor-open', openModal);
            modalRoot.removeEventListener('cell-editor-close', closeModal);
        };
    }, []);

    return (
        <div id="cellEditorModal"
            className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 hidden modal">
            <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-lg overflow-hidden border border-gray-100">
                <div className="bg-gradient-to-r from-gray-800 to-slate-900 p-5 text-white flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center text-lg">
                            <i className="fas fa-layer-group"></i>
                        </div>
                        <div>
                            <h3 id="cellEditorTitle" className="text-base font-black uppercase tracking-wider">
                                Rész-tételek kezelése
                            </h3>
                            <p className="text-[10px] text-gray-400 uppercase tracking-wide font-mono">
                                HMI Multi-Transaction Module
                            </p>
                        </div>
                    </div>
                    <button type="button" id="btnCloseCellModalX"
                        className="w-8 h-8 flex items-center justify-center bg-white/10 hover:bg-white/20 rounded-lg text-white transition">
                        <i className="fas fa-times"></i>
                    </button>
                </div>

                <div className="p-6 bg-gray-50 border-b border-gray-100 max-h-[180px] overflow-y-auto">
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-wider mb-2">
                        Eddig rögzített rész-tételek
                    </label>
                    <div id="subEntriesContainer" className="space-y-2"></div>
                </div>

                <div className="p-6 space-y-4">
                    <div className="grid grid-cols-3 gap-3">
                        <div className="col-span-2">
                            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-wider mb-1">
                                Új részösszeg
                            </label>
                            <input ref={amountInputRef} type="number" id="cellAmountInput"
                                className="w-full bg-gray-50 border-2 border-gray-200 rounded-xl px-4 py-3 text-sm font-bold text-gray-800 focus:border-blue-500 focus:bg-white outline-none transition"
                                placeholder="0" />
                        </div>
                        <div>
                            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-wider mb-1">
                                Deviza
                            </label>
                            <select id="cellCurrencyInput"
                                className="w-full bg-gray-50 border-2 border-gray-200 rounded-xl px-3 py-3 text-sm font-bold text-gray-800 focus:border-blue-500 focus:bg-white outline-none transition"
                                defaultValue="HUF">
                                <option value="HUF">HUF</option>
                                <option value="EUR">EUR</option>
                            </select>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-wider mb-1">
                                Fizetési mód
                            </label>
                            <select id="cellMethodInput"
                                className="w-full bg-gray-50 border-2 border-gray-200 rounded-xl px-4 py-3 text-sm font-bold text-gray-800 focus:border-blue-500 focus:bg-white outline-none transition"
                                defaultValue="Kártya">
                                <option value="Kártya">Kártya</option>
                                <option value="Készpénz">Készpénz</option>
                                <option value="Utalás">Utalás</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-wider mb-1">
                                Megjegyzés
                            </label>
                            <input type="text" id="cellNoteInput"
                                className="w-full bg-gray-50 border-2 border-gray-200 rounded-xl px-4 py-3 text-sm font-medium text-gray-800 focus:border-blue-500 focus:bg-white outline-none transition"
                                placeholder="pl. Lidl, MOL..." />
                        </div>
                    </div>

                    <div>
                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-wider mb-1">
                            Szín
                        </label>
                        <div className="flex gap-2.5 pt-1">
                            <button type="button"
                                className="color-selector-btn w-8 h-8 rounded-full bg-gray-100 border border-gray-300 transition active:scale-90 ring-4 ring-black"
                                data-color="transparent"></button>
                            <button type="button"
                                className="color-selector-btn w-8 h-8 rounded-full bg-blue-100 border border-blue-300 transition active:scale-90"
                                data-color="#dbeafe"></button>
                            <button type="button"
                                className="color-selector-btn w-8 h-8 rounded-full bg-emerald-100 border border-emerald-300 transition active:scale-90"
                                data-color="#d1fae5"></button>
                            <button type="button"
                                className="color-selector-btn w-8 h-8 rounded-full bg-amber-100 border border-amber-300 transition active:scale-90"
                                data-color="#fef3c7"></button>
                            <button type="button"
                                className="color-selector-btn w-8 h-8 rounded-full bg-rose-100 border border-rose-300 transition active:scale-90"
                                data-color="#ffe4e6"></button>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 pt-2 bg-red-50/40 p-3 rounded-2xl border border-red-100/30">
                        <input type="checkbox" id="cellIsStorno"
                            className="w-4 h-4 text-rose-600 border-gray-300 rounded focus:ring-rose-500 cursor-pointer" />
                        <label htmlFor="cellIsStorno"
                            className="text-xs font-black text-rose-800 cursor-pointer select-none flex items-center gap-1.5">
                            <i className="fas fa-ban text-xs"></i> Sztornó (érvénytelen / visszavont tétel)
                        </label>
                    </div>
                </div>

                <div className="border-t border-gray-100 flex text-sm font-bold bg-gray-50">
                    <button type="button" id="btnCancelCellModal"
                        className="flex-1 py-4 text-gray-600 hover:bg-gray-100 transition text-center border-r border-gray-100 uppercase tracking-wider">
                        Bezárás
                    </button>
                    <button type="button" id="btnSaveCellModal"
                        className="flex-1 py-4 bg-emerald-600 text-white hover:bg-emerald-700 transition text-center font-black uppercase tracking-wider shadow-inner flex items-center justify-center gap-2">
                        <i className="fas fa-plus-circle"></i> Tétel Hozzáadása
                    </button>
                </div>
            </div>
        </div>
    );
}
