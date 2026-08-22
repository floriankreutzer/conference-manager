(function () {
  const key = 'conference_catalog_v2';
  try {
    if (!localStorage.getItem(key) && typeof catalog !== 'undefined' && catalog) {
      localStorage.setItem(key, JSON.stringify(catalog));
    }
  } catch (_) {}

  function loadScript(src, marker) {
    if (document.querySelector(`script[${marker}]`)) return;
    const script = document.createElement('script');
    script.async = false;
    script.src = src;
    script.setAttribute(marker, 'true');
    document.head.appendChild(script);
  }

  loadScript('site-info.js?v=20260822-13', 'data-site-info-module');
  loadScript('welcome-pdf-v2.js?v=20260822-13', 'data-welcome-pdf-v2');
  loadScript('profile-welcome.js?v=20260822-17', 'data-profile-welcome-module');
  loadScript('manager-reports.js?v=20260822-17', 'data-manager-reports-module');
  loadScript('ux-enhancements-v16.js?v=20260822-16', 'data-ux-enhancements-v16');
  loadScript('ui-v17.js?v=20260822-17', 'data-ui-v17');

  document.addEventListener('click', function (e) {
    const button = e.target.closest('[data-welcome-pdf]');
    if (!button) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const id = button.dataset.welcomePdf;
    if (typeof window.createConferenceWelcomePdfV2 === 'function') {
      window.createConferenceWelcomePdfV2(id);
      return;
    }
    setTimeout(function () {
      if (typeof window.createConferenceWelcomePdfV2 === 'function') {
        window.createConferenceWelcomePdfV2(id);
      }
    }, 150);
  }, true);
})();