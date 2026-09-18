// sync-diff-view.js
// Kétpaneles modal a Local vs Cloud különbségek megjelenítésére.

export function showSyncDiffModal(diffResult) {
  const previouslyFocused = document.activeElement;

  // A modal létrehozása
  const overlay = document.createElement('div');
  overlay.id = 'syncDiffOverlay';
  overlay.className = 'fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center';

  const modal = document.createElement('div');
  modal.className = 'bg-white dark:bg-gray-800 rounded-xl shadow-xl w-11/12 max-w-5xl h-[80vh] flex flex-col overflow-hidden';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'syncDiffTitle');
  modal.tabIndex = -1;

  // Fejléc
  const header = document.createElement('div');
  header.className = 'flex justify-between items-center p-4 border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-900';
  header.innerHTML = `
    <h2 id="syncDiffTitle" class="text-xl font-bold dark:text-white"><i class="fas fa-exchange-alt mr-2"></i> Szinkronizációs Eltérések</h2>
    <button id="closeSyncDiffBtn" aria-label="Bezárás" class="text-gray-500 hover:text-gray-700 dark:hover:text-white focus:outline-none">
      <i class="fas fa-times text-2xl"></i>
    </button>
  `;
  modal.appendChild(header);

  // Navigáció a táblák között
  const tablesContainer = document.createElement('div');
  tablesContainer.className = 'p-3 flex gap-2 overflow-x-auto bg-gray-100 dark:bg-gray-800 border-b dark:border-gray-700 custom-scrollbar sdv-tables';

  const tables = Object.keys(diffResult).filter(t => diffResult[t].diffs && diffResult[t].diffs.length > 0);

  if (tables.length === 0) {
    const emptyState = document.createElement('div');
    emptyState.className = 'flex-1 flex justify-center items-center p-8';
    emptyState.innerHTML = '<div class="text-center"><i class="fas fa-check-circle text-4xl text-green-500 mb-4"></i><p class="text-xl dark:text-white">Nincs eltérés, az adatok szinkronban vannak.</p></div>';
    modal.appendChild(emptyState);
  } else {
    // Tartalom konténer a paneleknek
    const contentArea = document.createElement('div');
    // Módosítva: a flex-col-t kivettük, és horizontálisan görgethetővé tettük keskeny képernyőn
    // Ez biztosítja, hogy a két panel egymás mellett marad.
    contentArea.className = 'flex-1 p-4 flex gap-4 overflow-x-auto lg:overflow-x-hidden min-h-0 bg-gray-50 dark:bg-gray-900';

    // Local Panel
    const localPanel = document.createElement('div');
    // Módosítva: a min-width biztosítja, hogy ne essenek össze mobilon
    localPanel.className = 'flex-1 flex flex-col bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg overflow-hidden min-w-[300px] shadow-sm';
    localPanel.innerHTML = `
      <div class="bg-blue-100 dark:bg-blue-900 p-2 font-bold text-blue-800 dark:text-blue-100 text-center border-b dark:border-blue-800 flex items-center justify-center">
        <i class="fas fa-database mr-2"></i> Helyi Adatbázis (Local)
      </div>
      <div id="localDiffContent" class="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar"></div>
    `;

    // Cloud Panel
    const cloudPanel = document.createElement('div');
    // Módosítva: a min-width biztosítja, hogy ne essenek össze mobilon
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
      tabBtn.textContent = `${table} (${diffResult[table].diffs.length})`;

      tabBtn.onclick = () => {
        // Aktív fül stílusának frissítése
        Array.from(tablesContainer.children).forEach(btn => {
          btn.className = 'px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors focus:outline-none bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 border dark:border-gray-600';
        });
        tabBtn.className = 'px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors focus:outline-none bg-blue-500 text-white shadow';

        // Tartalom renderelése az adott táblához
        renderTableDiff(table, diffResult[table].diffs);
      };

      tablesContainer.appendChild(tabBtn);
    });

    modal.appendChild(tablesContainer);
    modal.appendChild(contentArea);

    // Kezdeti renderelés (első tábla)
    setTimeout(() => renderTableDiff(tables[0], diffResult[tables[0]].diffs), 0);
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

  const focusableSelector = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  const isVisible = (element) => {
    if (!element || typeof element.focus !== 'function') return false;

    for (let current = element; current; current = current.parentElement) {
      if (current.hidden || current.getAttribute('aria-hidden') === 'true' || current.classList.contains('hidden')) {
        return false;
      }

      const computedStyle = window.getComputedStyle?.(current);
      if (computedStyle?.display === 'none' || computedStyle?.visibility === 'hidden') return false;
    }

    return true;
  };

  const closeModal = () => {
    if (!overlay.isConnected) return;

    document.removeEventListener('keydown', handleKeyDown);
    overlay.remove();

    const fallbackControl = Array.from(document.querySelectorAll(focusableSelector)).find(isVisible);
    const focusTarget = isVisible(previouslyFocused) ? previouslyFocused : fallbackControl;
    focusTarget?.focus();
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeModal();
      return;
    }

    if (event.key !== 'Tab') return;

    const focusableElements = Array.from(modal.querySelectorAll(focusableSelector)).filter(isVisible);
    if (focusableElements.length === 0) {
      event.preventDefault();
      modal.focus();
      return;
    }

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];
    if (!modal.contains(document.activeElement)) {
      event.preventDefault();
      firstElement.focus();
    } else if (event.shiftKey && document.activeElement === firstElement) {
      event.preventDefault();
      lastElement.focus();
    } else if (!event.shiftKey && document.activeElement === lastElement) {
      event.preventDefault();
      firstElement.focus();
    }
  };

  closeBtn.addEventListener('click', closeModal);
  cancelBtn.addEventListener('click', closeModal);
  document.addEventListener('keydown', handleKeyDown);
  closeBtn.focus();

  executeBtn.addEventListener('click', () => {
    closeModal();
    // Itt hívjuk meg a tényleges szinkronizációt
    if (window.app && window.app.dataSyncController) {
      window.app.dataSyncController.forceSync();
    }
  });

  // Segédfüggvény a diff rendereléséhez
  function renderTableDiff(tableName, diffs) {
    const localContainer = document.getElementById('localDiffContent');
    const cloudContainer = document.getElementById('cloudDiffContent');

    localContainer.innerHTML = '';
    cloudContainer.innerHTML = '';

    diffs.forEach(diff => {
      // Formázott JSON megjelenítéshez
      const formatData = (data) => {
        if (!data) {
          const empty = document.createElement('em');
          empty.className = 'text-gray-400';
          empty.textContent = 'Nincs adat';
          return empty;
        }

        const fragment = document.createDocumentFragment();

        // Próbáljuk a legfontosabb mezőket kiemelni
        for (const key of ['name', 'title']) {
          if (data[key]) {
            const summary = document.createElement('div');
            summary.className = 'font-bold mb-1';
            summary.textContent = String(data[key]);
            fragment.appendChild(summary);
          }
        }
        if (data.amount) {
          const amount = document.createElement('div');
          amount.className = 'text-blue-600 dark:text-blue-400 mb-1';
          amount.textContent = `${String(data.amount)} Ft`;
          fragment.appendChild(amount);
        }

        const details = document.createElement('div');
        details.className = 'flex flex-wrap';
        Object.keys(data)
          .filter(k => k !== 'id' && k !== 'name' && k !== 'title' && k !== 'amount' && typeof data[k] !== 'object')
          .forEach(k => {
            const detail = document.createElement('span');
            detail.className = 'text-xs mr-2';

            const label = document.createElement('span');
            label.className = 'text-gray-500';
            label.textContent = `${k}:`;

            detail.append(label, ` ${String(data[k])}`);
            details.appendChild(detail);
          });
        fragment.appendChild(details);

        const id = data.id ? String(data.id) : '';
        const idElement = document.createElement('div');
        idElement.className = 'text-[10px] text-gray-400 mt-1 truncate';
        idElement.title = id;
        idElement.textContent = `ID: ${id ? `${id.substring(0, 8)}...` : 'N/A'}`;
        fragment.appendChild(idElement);

        return fragment;
      };

      const appendBadge = (item, text, colorClasses) => {
        const row = document.createElement('div');
        row.className = 'flex justify-between items-start mb-1';

        const badge = document.createElement('span');
        badge.className = `badge ${colorClasses} text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider`;
        badge.textContent = text;

        row.appendChild(badge);
        item.appendChild(row);
      };

      const localItem = document.createElement('div');
      localItem.className = 'p-3 rounded border text-sm dark:text-gray-200 transition-colors duration-200 min-h-[80px]';

      const cloudItem = document.createElement('div');
      cloudItem.className = 'p-3 rounded border text-sm dark:text-gray-200 transition-colors duration-200 min-h-[80px]';

      if (diff.type === 'local_only') {
        localItem.classList.add('bg-green-50', 'border-green-200', 'dark:bg-green-900/30', 'dark:border-green-800');
        appendBadge(localItem, 'Új helyi', 'bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100');
        localItem.appendChild(formatData(diff.local));

        cloudItem.classList.add('bg-gray-50', 'border-dashed', 'border-gray-300', 'dark:bg-gray-800/50', 'dark:border-gray-700', 'flex', 'items-center', 'justify-center', 'text-gray-400');
        cloudItem.textContent = 'Hiányzik a felhőből';
      }
      else if (diff.type === 'cloud_only') {
        localItem.classList.add('bg-gray-50', 'border-dashed', 'border-gray-300', 'dark:bg-gray-800/50', 'dark:border-gray-700', 'flex', 'items-center', 'justify-center', 'text-gray-400');
        localItem.textContent = 'Hiányzik helyben';

        cloudItem.classList.add('bg-blue-50', 'border-blue-200', 'dark:bg-blue-900/30', 'dark:border-blue-800');
        appendBadge(cloudItem, 'Új felhő', 'bg-blue-100 text-blue-800 dark:bg-blue-800 dark:text-blue-100');
        cloudItem.appendChild(formatData(diff.cloud));
      }
      else if (diff.type === 'modified') {
        localItem.classList.add('bg-yellow-50', 'border-yellow-200', 'dark:bg-yellow-900/30', 'dark:border-yellow-800');
        appendBadge(localItem, 'Módosult', 'bg-yellow-100 text-yellow-800 dark:bg-yellow-800 dark:text-yellow-100');
        localItem.appendChild(formatData(diff.local));

        cloudItem.classList.add('bg-yellow-50', 'border-yellow-200', 'dark:bg-yellow-900/30', 'dark:border-yellow-800');
        appendBadge(cloudItem, 'Módosult', 'bg-yellow-100 text-yellow-800 dark:bg-yellow-800 dark:text-yellow-100');
        cloudItem.appendChild(formatData(diff.cloud));
      }
      else if (diff.type === 'deleted') {
        localItem.classList.add('bg-red-50', 'border-red-200', 'dark:bg-red-900/30', 'dark:border-red-800');
        appendBadge(localItem, 'Törlésre vár', 'bg-red-100 text-red-800 dark:bg-red-800 dark:text-red-100');
        const deletionMessage = document.createElement('div');
        deletionMessage.className = 'text-red-700 dark:text-red-200';
        deletionMessage.textContent = 'Helyileg törölve';
        localItem.appendChild(deletionMessage);

        cloudItem.classList.add('bg-red-50', 'border-red-200', 'dark:bg-red-900/30', 'dark:border-red-800');
        appendBadge(cloudItem, 'Törlendő felhőadat', 'bg-red-100 text-red-800 dark:bg-red-800 dark:text-red-100');
        cloudItem.appendChild(formatData(diff.cloud));
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

    // Kérjük le a diff-et a syncManagertől
    const diffResult = await app.syncManager.getDiffData(mode);

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
