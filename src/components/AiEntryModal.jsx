import React, { useEffect, useState, useRef } from 'react';

export default function AiEntryModal() {
    const [isOpen, setIsOpen] = useState(false);
    const [inputText, setInputText] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [parsedData, setParsedData] = useState(null);
    const inputRef = useRef(null);

    useEffect(() => {
        const root = document.getElementById('costAppAiModalRoot');
        if (!root) return;

        const openHandler = () => {
            setIsOpen(true);
            setInputText('');
            setError(null);
            setParsedData(null);
            setIsLoading(false);
            setTimeout(() => {
                inputRef.current?.focus();
            }, 100);
        };

        const closeHandler = () => {
            setIsOpen(false);
        };

        root.addEventListener('ai-modal-open', openHandler);
        root.addEventListener('ai-modal-close', closeHandler);

        return () => {
            root.removeEventListener('ai-modal-open', openHandler);
            root.removeEventListener('ai-modal-close', closeHandler);
        };
    }, []);

    const handleClose = () => {
        if (window.app?.aiModal) {
            window.app.aiModal.close();
        } else {
            setIsOpen(false);
        }
    };

    const handleAnalyze = async () => {
        const text = inputText.trim();
        if (!text) {
            window.app?.hmiNotif?.showToast('Kérjük, írjon be egy mondatot!', 'error');
            return;
        }

        setIsLoading(true);
        setError(null);
        setParsedData(null);

        try {
            if (!window.app?.aiModal) {
                throw new Error("AI Modul nem elérhető.");
            }
            const data = await window.app.aiModal.analyze(text);

            setParsedData(data);
        } catch (err) {
            console.error('[AI Parse Error]:', err);
            setError(err.message || 'Hiba történt az elemzés során.');
            window.app?.hmiNotif?.showToast(err.message || 'Hiba történt az elemzés során!', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleAnalyze();
        }
    };

    const handleConfirm = async () => {
        if (!parsedData) return;
        try {
            if (window.app?.aiModal) {
                await window.app.aiModal.confirmAndInsert(parsedData);
            }
            handleClose();
        } catch (err) {
            console.error(err);
        }
    };

    if (!isOpen) return null;

    const catIconData = parsedData?.catIconData || { iconClass: 'fas fa-tag', bgClass: 'bg-slate-100', textClass: 'text-slate-500' };

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[9999] transition-opacity duration-300 opacity-100" onClick={handleClose}>
            <div className="bg-white rounded-3xl p-6 max-w-lg w-full mx-auto shadow-2xl transform transition-all duration-300 scale-100 opacity-100" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="flex items-center justify-between mb-4 border-b border-gray-100 pb-3">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-100">
                            <i className="fas fa-magic"></i>
                        </div>
                        <div>
                            <h3 className="text-base font-black text-slate-800 uppercase tracking-wider">AI Gyorsfelvitel</h3>
                            <p className="text-[10px] text-slate-400 font-medium">Írja le a költségét vagy bevételét egyszerűen!</p>
                        </div>
                    </div>
                    <button onClick={handleClose} className="w-8 h-8 flex items-center justify-center hover:bg-slate-100 text-slate-400 hover:text-slate-600 rounded-full transition">
                        <i className="fas fa-times"></i>
                    </button>
                </div>

                {/* Input mező */}
                <div className="mb-4">
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5">Írja be pl.: "5000 Ft ebédre júliusban kártyával"</label>
                    <div className="relative">
                        <textarea ref={inputRef} value={inputText} onChange={(e) => setInputText(e.target.value)} onKeyDown={handleKeyDown} rows="3"
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition resize-none placeholder-slate-400"
                            placeholder="Pl. 120 EUR fűtésszámla augusztusra utalással..."></textarea>
                        <div className="absolute bottom-3 right-3 flex items-center gap-1.5 text-[10px] text-slate-400 font-semibold bg-white px-2.5 py-1 rounded-lg border border-slate-100 shadow-sm pointer-events-none">
                            <i className="fas fa-keyboard text-slate-300"></i> Enter az elemzéshez
                        </div>
                    </div>
                </div>

                {/* Elemzés gomb */}
                <button onClick={handleAnalyze} disabled={isLoading} className="w-full py-3.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-2xl font-black text-xs uppercase tracking-wider transition flex items-center justify-center gap-2 shadow-lg shadow-indigo-100 disabled:opacity-50">
                    {isLoading ? (
                        <i className="fas fa-sync fa-spin"></i>
                    ) : (
                        <i className="fas fa-brain"></i>
                    )}
                    <span>Költség Elemzése</span>
                </button>

                {/* Betöltő állapot */}
                {isLoading && (
                    <div className="my-8 text-center animate-pulse">
                        <div className="w-12 h-12 rounded-full border-4 border-indigo-500/20 border-t-indigo-600 animate-spin mx-auto mb-3"></div>
                        <p className="text-xs font-bold text-slate-600">Az AI éppen értelmezi a bejegyzést...</p>
                        <p className="text-[10px] text-slate-400 mt-1">Kategória és hónap automatikus egyeztetése folyamatban.</p>
                    </div>
                )}

                {/* Hiba állapot */}
                {error && !isLoading && (
                    <div className="my-6 bg-rose-50 border border-rose-100 rounded-2xl p-5 text-center">
                        <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center text-rose-600 mx-auto mb-2.5">
                            <i className="fas fa-exclamation-triangle text-sm"></i>
                        </div>
                        <h4 className="text-xs font-black text-rose-800 uppercase tracking-wider mb-1">Nem sikerült elemezni a bejegyzést</h4>
                        <p className="text-xs text-rose-600 font-semibold">{error}</p>
                        <p className="text-[10px] text-slate-400 mt-2 font-medium">Tipp: Próbálja meg más szavakkal megfogalmazni, pl. adja meg az összeget (HUF vagy Ft), a kategóriát vagy a hónapot egyértelműbben!</p>
                    </div>
                )}

                {/* Elemzési eredmény */}
                {parsedData && !isLoading && !error && (
                    <div className="mt-6 bg-slate-50 border border-slate-100 rounded-2xl p-5 relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-2xl pointer-events-none"></div>

                        <h4 className="text-xs font-black text-indigo-700 uppercase tracking-wider mb-3.5 flex items-center gap-1.5">
                            <i className="fas fa-clipboard-check"></i> Elemzett adatok:
                        </h4>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Összeg */}
                            <div className="bg-white p-3 rounded-xl border border-slate-100/60">
                                <span className="block text-[9px] font-black text-slate-400 uppercase tracking-wider">Összeg</span>
                                <span className="text-base font-black text-slate-800">{`${parsedData.amount.toLocaleString('hu-HU')} ${parsedData.currency}`}</span>
                            </div>

                            {/* Fizetési Mód */}
                            <div className="bg-white p-3 rounded-xl border border-slate-100/60">
                                <span className="block text-[9px] font-black text-slate-400 uppercase tracking-wider">Fizetési mód</span>
                                <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5 mt-0.5">
                                    <i className={`fas ${parsedData.paymentMethod === 'Készpénz' ? 'fa-money-bill-wave text-emerald-500' : parsedData.paymentMethod === 'Utalás' ? 'fa-university text-amber-500' : 'fa-credit-card text-blue-500'}`}></i>
                                    <span>{parsedData.paymentMethod}</span>
                                </span>
                            </div>

                            {/* Kategória */}
                            <div className="bg-white p-3 rounded-xl border border-slate-100/60">
                                <span className="block text-[9px] font-black text-slate-400 uppercase tracking-wider">Kategória</span>
                                <div className="flex items-center justify-between mt-1">
                                    <div className="flex items-center gap-1.5">
                                        <div className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 ${catIconData.bgClass}`}>
                                            <i className={`${catIconData.iconClass} text-[10px] ${catIconData.textClass}`}></i>
                                        </div>
                                        <span className="text-xs font-bold text-slate-800">{parsedData.category}</span>
                                    </div>
                                    <span className={`text-[9px] px-1.5 py-0.5 rounded-md font-bold uppercase tracking-wider border ${parsedData.isNewCategory ? 'bg-purple-50 text-purple-700 border-purple-100' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                                        {parsedData.isNewCategory ? 'ÚJ KATEGÓRIA' : 'MEGLÉVŐ'}
                                    </span>
                                </div>
                            </div>

                            {/* Hónap */}
                            <div className="bg-white p-3 rounded-xl border border-slate-100/60">
                                <span className="block text-[9px] font-black text-slate-400 uppercase tracking-wider">Hónap</span>
                                <div className="flex items-center justify-between mt-0.5">
                                    <span className="text-xs font-bold text-slate-800 font-mono">{parsedData.month}</span>
                                    <span className={`text-[9px] px-1.5 py-0.5 rounded-md font-bold uppercase tracking-wider border ${parsedData.isNewMonth ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                                        {parsedData.isNewMonth ? 'ÚJ HÓNAP' : 'MEGLÉVŐ'}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Megjegyzés */}
                        <div className="mt-4 bg-white p-3 rounded-xl border border-slate-100/60">
                            <span className="block text-[9px] font-black text-slate-400 uppercase tracking-wider">Megjegyzés / Leírás</span>
                            <p className="text-xs font-semibold text-slate-700 mt-1 italic">{parsedData.note || 'Nincs leírás'}</p>
                        </div>

                        {/* Actions */}
                        <div className="mt-5 flex items-center gap-3">
                            <button onClick={handleClose} className="w-1/3 py-3 bg-white border border-slate-200 hover:bg-slate-50 hover:border-slate-300 text-slate-600 rounded-2xl font-bold text-xs transition shadow-sm">
                                Mégsem
                            </button>
                            <button onClick={handleConfirm} className="w-2/3 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-bold text-xs shadow-md shadow-indigo-200 transition flex items-center justify-center gap-2">
                                <i className="fas fa-check-circle"></i>
                                Jóváhagyás & Mentés
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
