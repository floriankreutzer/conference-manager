(function () {
  const key = 'conference_catalog_v2';
  try {
    if (!localStorage.getItem(key) && typeof catalog !== 'undefined' && catalog) {
      localStorage.setItem(key, JSON.stringify(catalog));
    }
  } catch (_) {}

  if (!document.querySelector('script[data-site-info-module]')) {
    const script = document.createElement('script');
    script.src = 'site-info.js?v=20260822-9';
    script.dataset.siteInfoModule = 'true';
    document.head.appendChild(script);
  }
})();
