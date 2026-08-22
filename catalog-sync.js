(() => {
  const CATALOG_KEY = 'conference_catalog_v2';

  try {
    if (!localStorage.getItem(CATALOG_KEY) && typeof catalog !== 'undefined' && catalog) {
      localStorage.setItem(CATALOG_KEY, JSON.stringify(catalog));
    }
  } catch {
    // Local storage is optional in the MVP; the in-memory catalog remains usable.
  }

  const normalizeCatalogTabs = () => {
    const itemTab = document.getElementById('catalogItemsTab');
    if (itemTab && itemTab.dataset.catalogTab !== 'items') itemTab.dataset.catalogTab = 'items';
  };

  const watchCatalogTabs = () => {
    normalizeCatalogTabs();
    const navigation = document.querySelector('.catalog-nav');
    if (!navigation || navigation.__catalogTabNormalizer) return;

    const observer = new MutationObserver(normalizeCatalogTabs);
    observer.observe(navigation, { childList: true });
    navigation.__catalogTabNormalizer = observer;
  };

  const loadScript = (src, marker) => {
    if (document.querySelector(`script[${marker}]`)) return;

    const script = document.createElement('script');
    script.async = false;
    script.src = src;
    script.setAttribute(marker, 'true');
    document.head.appendChild(script);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', watchCatalogTabs, { once: true });
  } else {
    watchCatalogTabs();
  }

  loadScript('site-info.js?v=20260822-13', 'data-site-info-module');
  loadScript('welcome-pdf-v2.js?v=20260822-29', 'data-welcome-pdf-v2');
  loadScript('profile-welcome.js?v=20260822-17', 'data-profile-welcome-module');
  loadScript('manager-reports.js?v=20260822-17', 'data-manager-reports-module');
  loadScript('ui-v17.js?v=20260822-17', 'data-ui-v17');
  loadScript('brand-theme-v20.js?v=20260822-20', 'data-brand-theme-v20');
  loadScript('employee-ux-v21.js?v=20260822-21', 'data-employee-ux-v21');
  loadScript('employee-p0-v22.js?v=20260822-22', 'data-employee-p0-v22');
  loadScript('employee-form-v23.js?v=20260822-23', 'data-employee-form-v23');
  loadScript('navigation-help-v23.js?v=20260822-23', 'data-navigation-help-v23');
  loadScript('submit-notify-v23.js?v=20260822-23', 'data-submit-notify-v23');
  loadScript('workflow-fixes-v23.js?v=20260822-23', 'data-workflow-fixes-v23');
  loadScript('workflow-core-v27.js?v=20260822-31', 'data-workflow-core-v27');
  loadScript('request-change-v27.js?v=20260822-29', 'data-request-change-v27');
  loadScript('employee-consolidated-v27.js?v=20260822-29', 'data-employee-consolidated-v27');
  loadScript('i18n-site-v26.js?v=20260822-29', 'data-i18n-site-v26');
  loadScript('i18n-late-register-v28.js?v=20260822-29', 'data-i18n-late-register-v28');
  loadScript('timeline-style-v28.js?v=20260822-29', 'data-timeline-style-v28');
  loadScript('timeline-v27.js?v=20260822-31', 'data-timeline-v27');
  loadScript('ux-final-v27.js?v=20260822-29', 'data-ux-final-v27');

  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-welcome-pdf]');
    if (!button) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    const requestId = button.dataset.welcomePdf;

    if (typeof window.createConferenceWelcomePdfV2 === 'function') {
      window.createConferenceWelcomePdfV2(requestId);
      return;
    }

    setTimeout(() => {
      if (typeof window.createConferenceWelcomePdfV2 === 'function') {
        window.createConferenceWelcomePdfV2(requestId);
      }
    }, 150);
  }, true);
})();
