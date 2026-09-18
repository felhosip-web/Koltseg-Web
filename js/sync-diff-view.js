// sync-diff-view.js
// Kétpaneles modal a Local vs Cloud különbségek megjelenítésére.

export function showSyncDiffModal(diffs) {
  // A modal létrehozása
  const overlay = document.createElement('div');
  overlay.id = 'syncDiffOverlay';
  overlay.className = 'fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center';

  const modal = document.createElement('div');
  modal.className = 'bg-white dark:bg-gray-800 rounded-xl shadow-xl w-11/12 max-w-5xl h-[80vh] flex flex-col overflow-hidden';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'syncDiffModalTitle');

  // Fejléc
  const header = document.createElement('div');
  header.className = 'flex justify-between items-center p-4 border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-900';
  header.innerHTML = `
    <h2 id="syncDiffModalTitle" class="text-xl font-bold dark:text-white"><i class="fas fa-exchange-alt mr-2"></i> Szinkronizációs Eltérések</h2>
    <button id="closeSyncDiffBtn" aria-label="Bezárás" class="text-gray-500 hover:text-gray-700 dark:hover:text-white focus:outline-none">
      <i class="fas fa-times text-2xl"></i>
    </button>
  `;
  modal.appendChild(header);

  // Group diffs by table
  const groupedDiffs = {};

  const processItem = (item, source) => {
      const table = item.table;
      if (!groupedDiffs[table]) {
          groupedDiffs[table] = [];
      }

      // In getSyncDiff:
      // item.type is 'new', 'deleted', 'modified'
      // item.local and item.cloud might contain the actual data objects (if passed by getSyncDiff, otherwise we only have labels).
      // Assuming getSyncDiff returns local and cloud objects if available, else we fall back to label.

      // We map the getSyncDiff types ('new', 'deleted', 'modified')
      // back to the logical types expected by the UI ('local_only', 'cloud_only', 'modified', 'deleted')

      let logicalType = 'modified';
      if (item.type === 'new' && source === 'local') logicalType = 'local_only';
      if (item.type === 'new' && source === 'cloud') logicalType = 'cloud_only';
      if (item.type === 'deleted') logicalType = 'deleted';

      groupedDiffs[table].push({
          type: logicalType,
          local: item.local || (source === 'local' ? { name: item.label } : null),
          cloud: item.cloud || (source === 'cloud' ? { name: item.label } : null),
          label: item.label
      });
  };

  (diffs.local || []).forEach(item => processItem(item, 'local'));
  (diffs.cloud || []).forEach(item => processItem(item, 'cloud'));

  const tables = Object.keys(groupedDiffs);

  // Navigáció a táblák között
  const tablesContainer = document.createElement('div');
  tablesContainer.className = 'p-3 flex gap-2 overflow-x-auto bg-gray-100 dark:bg-gray-800 border-b dark:border-gray-700 custom-scrollbar sdv-tables';

  if (tables.length === 0) {
    const emptyState = document.createElement('div');
    emptyState.className = 'flex-1 flex justify-center items-center p-8';
    emptyState.innerHTML = '<div class="text-center"><i class="fas fa-check-circle text-4xl text-green-500 mb-4"></i><p class="text-xl dark:text-white">Nincs eltérés, az adatok szinkronban vannak.</p></div>';
    modal.appendChild(emptyState);
  } else {
    // Tartalom konténer a paneleknek
    const contentArea = document.createElement('div');
    contentArea.className = 'flex-1 p-4 flex gap-4 overflow-x-auto lg:overflow-x-hidden min-h-0 bg-gray-50 dark:bg-gray-900';

    // Local Panel
    const localPanel = document.createElement('div');
    localPanel.className = 'flex-1 flex flex-col bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg overflow-hidden min-w-[300px] shadow-sm';
    localPanel.innerHTML = `
      <div class="bg-blue-100 dark:bg-blue-900 p-2 font-bold text-blue-800 dark:text-blue-100 text-center border-b dark:border-blue-800 flex items-center justify-center">
        <i class="fas fa-database mr-2"></i> Helyi Adatbázis (Local)
      </div>
      <div id="localDiffContent" class="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar"></div>
    `;

    // Cloud Panel
    const cloudPanel = document.createElement('div');
    cloudPanel.className = 'flex-1 flex flex-col bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg overflow-hidden min-w-[300px] shadow-sm';
    cloudPanel.innerHTML = `
      <div class="bg-purple-100 dark:bg-purple-900 p-2 font-bold text-purple-800 dark:text-purple-100 text-center border-b dark:border-purple-800 flex items-center justify-center">
        <i class="fas fa-cloud mr-2"></i> Felhő (Cloud)
      </div>
      <div id="cloudDiffContent" class="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar"></div>
    `;

    contentArea.appendChild(localPanel);
    contentArea.appendChild(cloudPanel);

    // Tábla fülek generálása
    tables.forEach((table, index) => {
      const tabBtn = document.createElement('button');
      tabBtn.className = `px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors focus:outline-none ${index === 0 ? 'bg-blue-500 text-white shadow' : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 border dark:border-gray-600'}`;
      tabBtn.textContent = `${table} (${groupedDiffs[table].length})`;

      tabBtn.onclick = () => {
        // Aktív fül stílusának frissítése
        Array.from(tablesContainer.children).forEach(btn => {
          btn.className = 'px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors focus:outline-none bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 border dark:border-gray-600';
        });
        tabBtn.className = 'px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors focus:outline-none bg-blue-500 text-white shadow';

        // Tartalom renderelése az adott táblához
        renderTableDiff(table, groupedDiffs[table]);
      };

      tablesContainer.appendChild(tabBtn);
    });

    modal.appendChild(tablesContainer);
    modal.appendChild(contentArea);

    // Kezdeti renderelés (első tábla)
    setTimeout(() => renderTableDiff(tables[0], groupedDiffs[tables[0]]), 0);
  }

  // Lábjegyzet (akció gombok)
  const footer = document.createElement('div');
  footer.className = 'p-4 border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-900 flex justify-end gap-3';
  footer.innerHTML = `
    <button id="cancelSyncBtn" class="px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-white rounded transition-colors font-medium">
      Mégse
    </button>
    <button id="executeSyncBtn" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded shadow transition-colors font-medium flex items-center">
      <i class="fas fa-sync-alt mr-2"></i> Szinkronizálás indítása
    </button>
  `;
  modal.appendChild(footer);

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  // Eseménykezelők
  const closeBtn = document.getElementById('closeSyncDiffBtn');
  const cancelBtn = document.getElementById('cancelSyncBtn');
  const executeBtn = document.getElementById('executeSyncBtn');

  const closeModal = () => {
    document.removeEventListener('keydown', handleEscape);
    document.body.removeChild(overlay);
  };

  const handleEscape = (e) => {
      if (e.key === 'Escape') closeModal();
  }
  document.addEventListener('keydown', handleEscape);

  // Set focus to modal for accessibility
  setTimeout(() => {
      closeBtn.focus();
  }, 100);

  closeBtn.addEventListener('click', closeModal);
  cancelBtn.addEventListener('click', closeModal);

  executeBtn.addEventListener('click', async () => {
    executeBtn.disabled = true;
    executeBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Szinkronizálás...';

    if (window.app && window.app.dataSyncController) {
      try {
        await window.app.dataSyncController.forceSync();

        executeBtn.innerHTML = '<i class="fas fa-check mr-2"></i> Kész!';
        executeBtn.classList.replace('bg-blue-600', 'bg-emerald-600');
        executeBtn.classList.replace('hover:bg-blue-700', 'hover:bg-emerald-700');

        setTimeout(() => {
          closeModal();

          // Re-check diff to verify sync worked, just like old UI did
          const checkBtn = document.getElementById('btnCheckSync');
          if (checkBtn) {
            checkBtn.click();
          }
        }, 1500);
      } catch (err) {
        // forceSync handles showing toast/info, just reset button
        executeBtn.disabled = false;
        executeBtn.innerHTML = '<i class="fas fa-sync-alt mr-2"></i> Újrapróbálkozás';
        executeBtn.classList.replace('bg-blue-600', 'bg-red-600');
        executeBtn.classList.replace('hover:bg-blue-700', 'hover:bg-red-700');
      }
    } else {
      closeModal();
    }
  });

  // Segédfüggvény a diff rendereléséhez
  function renderTableDiff(tableName, diffs) {
    const localContainer = document.getElementById('localDiffContent');
    const cloudContainer = document.getElementById('cloudDiffContent');

    localContainer.innerHTML = '';
    cloudContainer.innerHTML = '';

    diffs.forEach(diff => {
      // Formázott JSON megjelenítéshez biztonságos HTML escape-eléssel
      const escapeHtml = (unsafe) => {
        return (unsafe || '').toString()
             .replace(/&/g, "&amp;")
             .replace(/</g, "&lt;")
             .replace(/>/g, "&gt;")
             .replace(/"/g, "&quot;")
             .replace(/'/g, "&#039;");
      };

      const formatData = (data, fallbackLabel) => {
        if (!data) return `<em class="text-gray-400">${escapeHtml(fallbackLabel) || 'Nincs adat'}</em>`;
        // Próbáljuk a legfontosabb mezőket kiemelni
        let summary = '';
        if (data.name) summary += `<div class="font-bold mb-1">${escapeHtml(data.name)}</div>`;
        if (data.title) summary += `<div class="font-bold mb-1">${escapeHtml(data.title)}</div>`;
        if (data.amount) summary += `<div class="text-blue-600 dark:text-blue-400 mb-1">${escapeHtml(data.amount)} Ft</div>`;

        const details = Object.keys(data)
          .filter(k => k !== 'id' && k !== 'name' && k !== 'title' && k !== 'amount' && typeof data[k] !== 'object')
          .map(k => `<span class="text-xs mr-2"><span class="text-gray-500">${escapeHtml(k)}:</span> ${escapeHtml(data[k])}</span>`)
          .join('');

        return summary + `<div class="flex flex-wrap">${details}</div>` + `<div class="text-[10px] text-gray-400 mt-1 mt-1 truncate" title="${escapeHtml(data.id || '')}">ID: ${data.id ? escapeHtml(data.id.substring(0,8))+'...' : 'N/A'}</div>`;
      };

      const localItem = document.createElement('div');
      localItem.className = 'p-3 rounded border text-sm dark:text-gray-200 transition-colors duration-200 min-h-[80px] mb-2';

      const cloudItem = document.createElement('div');
      cloudItem.className = 'p-3 rounded border text-sm dark:text-gray-200 transition-colors duration-200 min-h-[80px] mb-2';

      if (diff.type === 'local_only') {
        localItem.classList.add('bg-green-50', 'border-green-200', 'dark:bg-green-900/30', 'dark:border-green-800');
        localItem.innerHTML = `<div class="flex justify-between items-start mb-1"><span class="badge bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100 text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider">Új helyi</span></div>${formatData(diff.local, diff.label)}`;

        cloudItem.classList.add('bg-gray-50', 'border-dashed', 'border-gray-300', 'dark:bg-gray-800/50', 'dark:border-gray-700', 'flex', 'items-center', 'justify-center', 'text-gray-400');
        cloudItem.innerHTML = 'Hiányzik a felhőből';
      }
      else if (diff.type === 'cloud_only') {
        localItem.classList.add('bg-gray-50', 'border-dashed', 'border-gray-300', 'dark:bg-gray-800/50', 'dark:border-gray-700', 'flex', 'items-center', 'justify-center', 'text-gray-400');
        localItem.innerHTML = 'Hiányzik helyben';

        cloudItem.classList.add('bg-blue-50', 'border-blue-200', 'dark:bg-blue-900/30', 'dark:border-blue-800');
        cloudItem.innerHTML = `<div class="flex justify-between items-start mb-1"><span class="badge bg-blue-100 text-blue-800 dark:bg-blue-800 dark:text-blue-100 text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider">Új felhő</span></div>${formatData(diff.cloud, diff.label)}`;
      }
      else if (diff.type === 'modified') {
        localItem.classList.add('bg-yellow-50', 'border-yellow-200', 'dark:bg-yellow-900/30', 'dark:border-yellow-800');
        localItem.innerHTML = `<div class="flex justify-between items-start mb-1"><span class="badge bg-yellow-100 text-yellow-800 dark:bg-yellow-800 dark:text-yellow-100 text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider">Módosult</span></div>${formatData(diff.local, diff.label)}`;

        cloudItem.classList.add('bg-yellow-50', 'border-yellow-200', 'dark:bg-yellow-900/30', 'dark:border-yellow-800');
        cloudItem.innerHTML = `<div class="flex justify-between items-start mb-1"><span class="badge bg-yellow-100 text-yellow-800 dark:bg-yellow-800 dark:text-yellow-100 text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider">Módosult</span></div>${formatData(diff.cloud, diff.label)}`;
      }
      else if (diff.type === 'deleted') {
        localItem.classList.add('bg-red-50', 'border-red-200', 'dark:bg-red-900/30', 'dark:border-red-800');
        localItem.innerHTML = `<div class="flex justify-between items-start mb-1"><span class="badge bg-red-100 text-red-800 dark:bg-red-800 dark:text-red-100 text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider">Törlésre vár</span></div>${formatData(diff.local, diff.label)}`;

        cloudItem.classList.add('bg-red-50', 'border-red-200', 'dark:bg-red-900/30', 'dark:border-red-800');
        cloudItem.innerHTML = `<div class="flex justify-between items-start mb-1"><span class="badge bg-red-100 text-red-800 dark:bg-red-800 dark:text-red-100 text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider">Törlésre vár</span></div>${formatData(diff.cloud, diff.label)}`;
      }

      // Párok vizuális összekapcsolása hover esetén (opcionális extra)
      const handleHover = (isHover) => {
        const opacity = isHover ? '1' : '0.9';
        const shadow = isHover ? 'shadow-md' : 'shadow-none';
        localItem.style.opacity = opacity;
        cloudItem.style.opacity = opacity;
        if(isHover) {
          localItem.classList.add('shadow-md');
          cloudItem.classList.add('shadow-md');
        } else {
          localItem.classList.remove('shadow-md');
          cloudItem.classList.remove('shadow-md');
        }
      };

      localItem.addEventListener('mouseenter', () => handleHover(true));
      localItem.addEventListener('mouseleave', () => handleHover(false));
      cloudItem.addEventListener('mouseenter', () => handleHover(true));
      cloudItem.addEventListener('mouseleave', () => handleHover(false));

      localContainer.appendChild(localItem);
      cloudContainer.appendChild(cloudItem);
    });
  }
}

export async function runAndShowSyncDiff(app, mode = 'pull') {
  try {
    // UI visszajelzés (pl. gomb letiltása / loading spinner mutatás - ezt hívó oldalon is lehet)
    app.hmiNotif?.showToast('Adatok letöltése és összehasonlítása...', 'info');

    // Kérjük le a diff-et a syncManagertől (getSyncDiff már kezeli a deleted_records-t!)
    const diffResult = await app.syncManager.getSyncDiff();

    // Jelenítsük meg a modalt
    showSyncDiffModal(diffResult);

  } catch (error) {
    console.error('[SyncDiff] Hiba történt:', error);
    app.hmiNotif?.showToast('Hiba az adatok letöltésekor: ' + error.message, 'error');
    throw error;
  }
}

// Stílusok injektálása (a gördülősávhoz és egyebekhez)
const style = document.createElement('style');
style.textContent = `
  .custom-scrollbar::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }
  .custom-scrollbar::-webkit-scrollbar-track {
    background: transparent;
  }
  .custom-scrollbar::-webkit-scrollbar-thumb {
    background-color: rgba(156, 163, 175, 0.5);
    border-radius: 10px;
  }
  .dark .custom-scrollbar::-webkit-scrollbar-thumb {
    background-color: rgba(75, 85, 99, 0.5);
  }
`;
document.head.appendChild(style);
