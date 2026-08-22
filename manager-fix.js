(function () {
  const CATALOG_KEY = 'conference_catalog_v2';

  // Remove incompatible locally cached catalog data from older MVP builds.
  try {
    const raw = localStorage.getItem(CATALOG_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      const valid = data &&
        Array.isArray(data.rooms) &&
        Array.isArray(data.services) &&
        Array.isArray(data.cateringPackages) &&
        Array.isArray(data.cateringItems) &&
        data.cateringPackages.every(p => Array.isArray(p.variants));
      if (!valid) localStorage.removeItem(CATALOG_KEY);
    }
  } catch (_) {
    localStorage.removeItem(CATALOG_KEY);
  }

  function activateManagerTab(tab) {
    try {
      if (typeof setManagerTab === 'function') {
        setManagerTab(tab);
        return;
      }
    } catch (err) {
      console.error('Manager tab error:', err);
    }

    document.querySelectorAll('[data-manager-tab]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.managerTab === tab);
    });
    document.getElementById('managerRequestsPanel')?.classList.toggle('hidden', tab !== 'requests');
    document.getElementById('managerCatalogPanel')?.classList.toggle('hidden', tab !== 'catalog');

    if (tab === 'catalog') {
      try {
        if (typeof renderCatalog === 'function') renderCatalog();
      } catch (err) {
        console.error('Catalog render error:', err);
        const editor = document.getElementById('catalogEditor');
        if (editor) editor.innerHTML = '<div class="info-box">Der lokale Angebotskatalog war nicht kompatibel. Bitte „Standardwerte wiederherstellen“ wählen.</div>';
      }
    }
  }

  function activateCatalogTab(tab) {
    try {
      if (typeof setCatalogTab === 'function') {
        setCatalogTab(tab);
        return;
      }
    } catch (err) {
      console.error('Catalog tab error:', err);
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('[data-manager-tab]').forEach(btn => {
      btn.style.pointerEvents = 'auto';
      btn.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        activateManagerTab(btn.dataset.managerTab);
      }, true);
    });

    document.querySelectorAll('[data-catalog-tab]').forEach(btn => {
      btn.style.pointerEvents = 'auto';
      btn.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        activateCatalogTab(btn.dataset.catalogTab);
      }, true);
    });
  });
})();
