(function () {
  const key = 'conference_catalog_v2';
  try {
    if (!localStorage.getItem(key) && typeof catalog !== 'undefined' && catalog) {
      localStorage.setItem(key, JSON.stringify(catalog));
    }
  } catch (_) {}
})();
