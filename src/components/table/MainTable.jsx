import React, { useEffect, useRef } from 'react';

export default function MainTable() {
    const tableRef = useRef(null);
    useEffect(() => {
        const renderTable = () => {
            if (window.app?.renderer && typeof window.app.renderer.renderTable === 'function') {
                window.app.renderer.renderTable();
            }
        };

        // Avoid double render if already booted, though app-data-updated will trigger it
        if (!window.app?.isBooted) {
             // Only force render if not booted yet, or let boot manager handle it
        } else {
             renderTable();
        }
        window.addEventListener('app-data-updated', renderTable);
        return () => window.removeEventListener('app-data-updated', renderTable);
    }, []);

    return (
        <div id="mainTableContainer"
            className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-visible p-0 md:p-2" ref={tableRef}>
        </div>
    );
}
