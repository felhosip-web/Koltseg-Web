import React, { useEffect, useRef } from 'react';

export default function WorkEditorModal() {
    const nameInputRef = useRef(null);

    const handleCancel = (e) => {
        e.preventDefault();
        window.app?.workLogRenderer?.closeModal?.();
    };

    const handleDelete = (e) => {
        e.preventDefault();
        window.app?.workLogRenderer?.handleDeleteWork?.();
    };

    const handleFormSubmit = (e) => {
        e.preventDefault();
        window.app?.workLogRenderer?.handleFormSubmit?.(e);
    };

    useEffect(() => {
        const modalRoot = document.getElementById('workAppEditorRoot');
        if (!modalRoot) return undefined;

        const openModal = () => {
            if (window.app?.modalManager) {
                window.app.modalManager.open('workEditorModal');
            } else {
                document.getElementById('workEditorModal')?.classList.remove('hidden');
            }
            nameInputRef.current?.focus();
        };

        const closeModal = () => {
            if (window.app?.modalManager) {
                window.app.modalManager.close('workEditorModal');
            } else {
                document.getElementById('workEditorModal')?.classList.add('hidden');
            }
        };

        modalRoot.addEventListener('work-editor-open', openModal);
        modalRoot.addEventListener('work-editor-close', closeModal);

        return () => {
            modalRoot.removeEventListener('work-editor-open', openModal);
            modalRoot.removeEventListener('work-editor-close', closeModal);
        };
    }, []);

    return (
        <div id="workEditorModal"
            className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 hidden modal">
            <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-lg overflow-hidden border border-gray-100">
                <div className="bg-gradient-to-r from-emerald-600 to-teal-700 p-5 text-white flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center text-lg"><i
                                className="fas fa-briefcase"></i></div>
                        <div>
                            <h3 id="workEditorTitle" className="text-base font-black uppercase tracking-wider">Új munka
                                rögzítése</h3>
                            <p className="text-[10px] text-emerald-100 uppercase tracking-wide font-mono">HMI Work Management
                                Module</p>
                        </div>
                    </div>
                    <button type="button" id="btnCloseWorkModalX" onClick={handleCancel}
                        className="w-8 h-8 flex items-center justify-center bg-white/10 hover:bg-white/20 rounded-lg text-white transition">
                        <i className="fas fa-times"></i>
                    </button>
                </div>
                <form id="workForm" className="p-6 space-y-4" onSubmit={handleFormSubmit}>
                    <input type="hidden" id="workIdInput" />

                    <div>
                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-wider mb-1">Munka
                            neve</label>
                        <input type="text" id="workNameInput" required ref={nameInputRef}
                            className="w-full bg-gray-50 border-2 border-gray-200 rounded-xl px-4 py-3 text-sm font-bold text-gray-800 focus:border-emerald-500 focus:bg-white outline-none transition"
                            placeholder="Pl. Tetőszerkezet javítása" />
                    </div>

                    <div>
                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-wider mb-1">Leírás /
                            Feladatok</label>
                        <textarea id="workDescriptionInput" rows="3"
                            className="w-full bg-gray-50 border-2 border-gray-200 rounded-xl px-4 py-3 text-sm font-medium text-gray-800 focus:border-emerald-500 focus:bg-white outline-none transition"
                            placeholder="Részletes leírás, szükséges anyagok..."></textarea>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-wider mb-1">Hol
                                (Helyszín)</label>
                            <input type="text" id="workLocationInput"
                                className="w-full bg-gray-50 border-2 border-gray-200 rounded-xl px-4 py-3 text-sm font-medium text-gray-800 focus:border-emerald-500 focus:bg-white outline-none transition"
                                placeholder="Pl. Budapest, XII. kerület" />
                        </div>
                        <div>
                            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-wider mb-1">Mikor
                                (Dátum)</label>
                            <input type="date" id="workDateInput" required
                                className="w-full bg-gray-50 border-2 border-gray-200 rounded-xl px-4 py-3 text-sm font-bold text-gray-800 focus:border-emerald-500 focus:bg-white outline-none transition" />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-wider mb-1">Hány nap
                                (Időtartam)</label>
                            <input type="number" id="workDurationInput" min="1" required
                                className="w-full bg-gray-50 border-2 border-gray-200 rounded-xl px-4 py-3 text-sm font-bold text-gray-800 focus:border-emerald-500 focus:bg-white outline-none transition"
                                placeholder="1" />
                        </div>
                        <div>
                            <label
                                className="block text-[10px] font-black text-gray-400 uppercase tracking-wider mb-1">Státusz</label>
                            <select id="workStatusInput" defaultValue="folyamatban"
                                className="w-full bg-gray-50 border-2 border-gray-200 rounded-xl px-3 py-3 text-sm font-bold text-gray-800 focus:border-emerald-500 focus:bg-white outline-none transition cursor-pointer">
                                <option value="folyamatban">Folyamatban 🟡</option>
                                <option value="elvégzett">Elvégzett 🟢</option>
                                <option value="meghiúsult">Meghiúsult 🔴</option>
                            </select>
                        </div>
                    </div>

                    <div className="border-t border-gray-100 pt-4 flex text-sm font-bold gap-3">
                        <button type="button" id="btnDeleteWork" onClick={handleDelete}
                            className="hidden px-5 py-3.5 bg-red-50 text-red-600 hover:bg-red-100 rounded-2xl transition flex items-center justify-center gap-1.5 font-bold uppercase tracking-wide">
                            <i className="fas fa-trash-alt"></i> Törlés
                        </button>
                        <button type="button" id="btnCancelWorkModal" onClick={handleCancel}
                            className="flex-1 py-3.5 border border-gray-200 rounded-2xl text-gray-600 hover:bg-gray-100 transition text-center uppercase tracking-wider">Bezárás</button>
                        <button type="submit" id="btnSaveWorkModal"
                            className="flex-1 py-3.5 bg-emerald-600 text-white hover:bg-emerald-700 rounded-2xl transition text-center font-black uppercase tracking-wider shadow-inner flex items-center justify-center gap-2">
                            <i className="fas fa-save"></i> Mentés
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}