import React, { useState, useEffect, useRef } from 'react';

const predefinedColors = [
    '#dbeafe', // Blue
    '#d1fae5', // Green
    '#fef3c7', // Yellow
    '#ffe4e6', // Rose
    '#f3e8ff'  // Purple
];

export default function HmiInputModal() {
    const [isOpen, setIsOpen] = useState(false);
    const [type, setType] = useState('item'); // 'item' or 'month'
    const [value, setValue] = useState('');
    const [color, setColor] = useState('#dbeafe');
    const [renameItemId, setRenameItemId] = useState(null);
    const [currentName, setCurrentName] = useState('');
    const inputRef = useRef(null);

    useEffect(() => {
        const handleOpen = (e) => {
            setType(e.detail.type);
            if (e.detail.type === 'item') {
                setValue('');
                setColor('#dbeafe');
            } else if (e.detail.type === 'rename') {
                setRenameItemId(e.detail.itemId);
                setCurrentName(e.detail.currentName || '');
                setValue(e.detail.currentName || '');
            } else {
                const now = new Date();
                const month = String(now.getMonth() + 1).padStart(2, '0');
                setValue(`${now.getFullYear()}-${month}`);
            }
            setIsOpen(true);
        };

        const rootEl = document.getElementById('costAppHmiInputRoot');
        if (rootEl) {
            rootEl.addEventListener('hmi-input-open', handleOpen);
        }
        document.addEventListener('hmi-input-open', handleOpen);

        return () => {
            if (rootEl) rootEl.removeEventListener('hmi-input-open', handleOpen);
            document.removeEventListener('hmi-input-open', handleOpen);
        };
    }, []);

    useEffect(() => {
        if (isOpen && type === 'rename') inputRef.current?.select();
    }, [isOpen, type]);

    const handleClose = () => {
        setIsOpen(false);
    };

    const handleSave = async () => {
        const inputModal = window.app?.uiController?.inputModal;
        if (type === 'rename' && inputModal?.performRename) {
            await inputModal.performRename(renameItemId, currentName, value);
            handleClose();
        } else if (inputModal?.performSave) {
            const saved = await inputModal.performSave(type, value, color);
            if (saved) handleClose();
        } else {
            console.error('The requested input modal save handler is not defined');
        }
    };

    if (!isOpen) return null;

    const isItem = type === 'item';
    const isRename = type === 'rename';
    const title = isRename ? 'Kategória átnevezése' : isItem ? 'Új kategória hozzáadása' : 'Új hónap megnyitása';
    const label = isRename ? 'Új név' : isItem ? 'Kategória megnevezése' : 'Hónap választása (ÉÉÉÉ-HH)';
    const placeholder = isItem ? 'Pl. Rezsi, Élelmiszer, Benzín...' : '';
    const inputType = isItem || isRename ? 'text' : 'month';

    return (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 modal">
            <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-md overflow-hidden border border-gray-100">
                <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-5 text-white flex items-center gap-3">
                    <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center text-lg">
                        <i className="fas fa-plus"></i>
                    </div>
                    <div>
                        <h3 className="text-base font-black uppercase tracking-wider">{title}</h3>
                        <p className="text-[10px] text-blue-100 uppercase tracking-wide font-mono">HMI Input Module</p>
                    </div>
                </div>

                <div className="p-6">
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                        {label}
                    </label>
                    <input
                        ref={inputRef}
                        type={inputType}
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                        className="w-full bg-gray-50 border-2 border-gray-200 rounded-2xl px-4 py-3.5 text-sm font-semibold text-gray-800 focus:border-blue-500 focus:bg-white outline-none transition-all"
                        placeholder={placeholder}
                        autoFocus
                    />

                    {isItem && (
                        <div className="mt-3">
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                                Kategória színe
                            </label>
                            <div className="flex gap-2">
                                {predefinedColors.map(c => (
                                    <button
                                        key={c}
                                        type="button"
                                        onClick={() => setColor(c)}
                                        className={`w-8 h-8 rounded-full border-2 border-white shadow ${color === c ? 'ring-2 ring-blue-500' : ''}`}
                                        style={{ background: c }}
                                    />
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <div className="border-t border-gray-100 flex text-sm font-bold bg-gray-50">
                    <button
                        onClick={handleClose}
                        className="flex-1 py-4 text-gray-600 hover:bg-gray-100 transition text-center border-r border-gray-100 uppercase tracking-wider"
                    >
                        Mégse
                    </button>
                    <button
                        onClick={handleSave}
                        className="flex-1 py-4 bg-blue-600 text-white hover:bg-blue-700 transition text-center font-black uppercase tracking-wider shadow-inner"
                    >
                        Mentés
                    </button>
                </div>
            </div>
        </div>
    );
}
