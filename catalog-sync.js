(function () {
  const key = 'conference_catalog_v2';
  try {
    if (!localStorage.getItem(key) && typeof catalog !== 'undefined' && catalog) {
      localStorage.setItem(key, JSON.stringify(catalog));
    }
  } catch (_) {}

  // Prevent the legacy guest-experience manager observer from starting.
  // That observer watched the full subtree and retriggered itself on every render.
  const managerList = document.getElementById('managerList');
  if (managerList) managerList.__guestObserved = true;

  if (!document.querySelector('script[data-site-info-module]')) {
    const script = document.createElement('script');
    script.src = 'site-info.js?v=20260822-12';
    script.dataset.siteInfoModule = 'true';
    document.head.appendChild(script);
  }

  if (!document.querySelector('script[data-manager-summary-module]')) {
    const script = document.createElement('script');
    script.src = 'manager-summary.js?v=20260822-12';
    script.dataset.managerSummaryModule = 'true';
    document.head.appendChild(script);
  }
})();
