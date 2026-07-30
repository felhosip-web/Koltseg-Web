// js/components/update-banner.js

export function showUpdateBanner(newVersion) {
    if (document.getElementById('pwa-update-banner')) return;

    const banner = document.createElement('div');
    banner.id = 'pwa-update-banner';
    banner.className = 'fixed bottom-4 left-1/2 transform -translate-x-1/2 bg-indigo-600 text-white px-4 py-3 rounded-2xl shadow-2xl z-[999999] flex items-center gap-4 animate-slide-up whitespace-nowrap';

    const text = document.createElement('span');
    text.className = 'text-sm font-bold flex items-center gap-2';
    text.innerHTML = `<i class="fas fa-sync-alt fa-spin"></i> Új verzió elérhető (${newVersion})`;

    const button = document.createElement('button');
    button.className = 'bg-white text-indigo-600 hover:bg-indigo-50 px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition shadow-sm';
    button.textContent = 'Frissítés';
    button.onclick = async () => {
        button.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        button.disabled = true;

        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage({ action: 'skipWaiting' });
        }

        try {
            const keys = await caches.keys();
            await Promise.all(keys.map(key => caches.delete(key)));
        } catch (e) {
            console.warn('[UpdateBanner] Hiba a cache törlésekor', e);
        }

        localStorage.setItem('app_version', newVersion);
        window.location.reload(true);
    };

    banner.appendChild(text);
    banner.appendChild(button);
    document.body.appendChild(banner);
}
