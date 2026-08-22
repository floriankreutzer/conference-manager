(() => {
  const REQUEST_KEY = 'conference_requests';
  const CATALOG_KEY = 'conference_catalog_v2';
  const SITE_KEY = 'conference_site_info_v1';
  const query = (selector, root = document) => root.querySelector(selector);
  const queryAll = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const translate = (key, values) => window.cmI18n?.t?.(key, values) ?? key;
  let previousFocus = null;

  const readJson = (key, fallback) => {
    try {
      return JSON.parse(localStorage.getItem(key) ?? JSON.stringify(fallback));
    } catch {
      return fallback;
    }
  };

  const getRequests = () => {
    const requests = readJson(REQUEST_KEY, []);
    return Array.isArray(requests) ? requests : [];
  };

  const getCatalog = () => readJson(CATALOG_KEY, null);

  const getSite = (location) => {
    try {
      if (typeof window.getConferenceSiteInfo === 'function') {
        return window.getConferenceSiteInfo(location) ?? {};
      }
    } catch {
      // Fall back to the locally stored MVP data.
    }
    return readJson(SITE_KEY, {})?.[location] ?? {};
  };

  const translateSource = (value) => window.cmI18n?.translateSource?.(String(value ?? '')) ?? String(value ?? '');

  const requestIdFromCard = (card) => (
    query('.request-meta', card)?.textContent?.match(/CR-\d{4}-\d+/)?.[0] ?? null
  );

  const safeExternalUrl = (value) => {
    if (!value) return null;
    try {
      const url = new URL(value, window.location.href);
      return url.protocol === 'https:' ? url.href : null;
    } catch {
      return null;
    }
  };

  const createTextElement = (tagName, text, className) => {
    const element = document.createElement(tagName);
    if (className) element.className = className;
    element.textContent = text;
    return element;
  };

  const appendParagraph = (root, text, { strong = false } = {}) => {
    if (!text) return;
    const paragraph = document.createElement('p');
    if (strong) paragraph.appendChild(createTextElement('strong', text));
    else paragraph.textContent = text;
    root.appendChild(paragraph);
  };

  const injectStyles = () => {
    if (query('#guestAccessibleStyles')) return;
    const style = document.createElement('style');
    style.id = 'guestAccessibleStyles';
    style.textContent = `
      .guest-info-overlay{position:fixed;inset:0;background:rgba(0,0,0,.58);display:none;align-items:center;justify-content:center;z-index:11000;padding:16px}
      .guest-info-overlay.open{display:flex}
      .guest-info-modal{background:#fff;width:min(920px,100%);max-height:92vh;overflow:auto;border:1px solid #d0d0ce}
      .guest-info-head{background:#000;color:#fff;border-bottom:6px solid var(--hospitality-camel,#C29A6B);padding:22px;display:flex;justify-content:space-between;gap:16px}
      .guest-info-head h2{margin:0 0 5px}.guest-info-head p{margin:0;color:#d0d0ce}
      .guest-info-body{padding:20px 22px}.guest-info-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
      .guest-info-card{border:1px solid #d0d0ce;padding:13px}.guest-info-card h3{margin:0 0 7px;border-bottom:2px solid var(--hospitality-camel,#C29A6B);padding-bottom:5px}
      .guest-info-actions{display:flex;gap:8px;flex-wrap:wrap;padding:16px 22px;border-top:1px solid #d0d0ce;background:#fafafa}
      .wifi-box{border-left:5px solid var(--hospitality-camel,#C29A6B);background:#f5f5f5;padding:12px;margin-top:12px}
      .wifi-code{font-family:ui-monospace,Menlo,monospace;background:#fff;border:1px solid #d0d0ce;padding:8px;margin-top:6px}
      @media(max-width:760px){.guest-info-grid{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  };

  const closeModal = () => {
    const overlay = query('#guestInfoOverlay');
    if (!overlay) return;
    overlay.classList.remove('open');
    overlay.hidden = true;
    if (previousFocus instanceof HTMLElement) previousFocus.focus();
    previousFocus = null;
  };

  const focusableElements = (root) => queryAll(
    'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
    root,
  ).filter((element) => !element.hidden && element.offsetParent !== null);

  const trapFocus = (event) => {
    const overlay = query('#guestInfoOverlay');
    if (!overlay?.classList.contains('open')) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      closeModal();
      return;
    }
    if (event.key !== 'Tab') return;

    const focusable = focusableElements(overlay);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const ensureModal = () => {
    if (query('#guestInfoOverlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'guestInfoOverlay';
    overlay.className = 'guest-info-overlay';
    overlay.hidden = true;

    const modal = document.createElement('section');
    modal.className = 'guest-info-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'guestInfoTitle');
    modal.setAttribute('aria-describedby', 'guestInfoSubtitle');

    const header = document.createElement('header');
    header.className = 'guest-info-head';
    const headingGroup = document.createElement('div');
    const title = createTextElement('h2', translate('guest.info'));
    title.id = 'guestInfoTitle';
    const subtitle = createTextElement('p', translate('guest.subtitle'));
    subtitle.id = 'guestInfoSubtitle';
    headingGroup.append(title, subtitle);

    const closeButton = createTextElement('button', translate('common.close'), 'secondary');
    closeButton.type = 'button';
    closeButton.id = 'closeGuestInfo';
    header.append(headingGroup, closeButton);

    const body = document.createElement('div');
    body.id = 'guestInfoBody';
    body.className = 'guest-info-body';

    const footer = document.createElement('footer');
    footer.className = 'guest-info-actions';
    const pdfButton = createTextElement('button', translate('guest.pdf'), 'primary');
    pdfButton.type = 'button';
    pdfButton.id = 'guestInfoPdf';
    footer.appendChild(pdfButton);

    modal.append(header, body, footer);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) closeModal();
    });
    closeButton.addEventListener('click', closeModal);
    overlay.addEventListener('keydown', trapFocus);
    pdfButton.addEventListener('click', () => {
      const requestId = pdfButton.dataset.requestId;
      if (!requestId) return;
      const proxy = document.createElement('button');
      proxy.type = 'button';
      proxy.dataset.welcomePdf = requestId;
      proxy.hidden = true;
      document.body.appendChild(proxy);
      proxy.click();
      proxy.remove();
    });
  };

  const decorateRequestButtons = () => {
    const requests = getRequests();
    queryAll('#requestList .request-card').forEach((card) => {
      const requestId = requestIdFromCard(card);
      const request = requests.find((item) => item.id === requestId);
      if (!request) return;

      const title = query('.request-top h3', card)?.textContent || request.title;
      query('[data-request-detail]', card)?.setAttribute('aria-label', translate('guest.detailsAria', { title }));
      query('[data-welcome-pdf]', card)?.setAttribute('aria-label', translate('guest.pdfAria', { title }));
      if (request.status !== 'Confirmed') return;

      let actions = query('.request-actions', card);
      if (!actions) {
        actions = document.createElement('div');
        actions.className = 'request-actions';
        card.appendChild(actions);
      }

      let guestButton = query('[data-guest-info]', card);
      if (!guestButton) {
        guestButton = createTextElement('button', translate('guest.show'), 'secondary');
        guestButton.type = 'button';
        guestButton.dataset.guestInfo = requestId;
        actions.insertBefore(guestButton, query('[data-welcome-pdf]', actions) || actions.firstChild);
      }
      guestButton.setAttribute('aria-label', translate('guest.infoAria', { title }));
    });
  };

  const createCard = (titleKey) => {
    const section = document.createElement('section');
    section.className = 'guest-info-card';
    section.appendChild(createTextElement('h3', translate(titleKey)));
    return section;
  };

  const openGuestInfo = (requestId, trigger) => {
    const request = getRequests().find((item) => item.id === requestId);
    if (!request) return;

    const catalogData = getCatalog();
    const room = catalogData?.rooms?.find((item) => item.id === request.roomId);
    const location = request.location || room?.location || translate('guest.locationDefault');
    const site = getSite(location);
    const body = query('#guestInfoBody');
    const overlay = query('#guestInfoOverlay');
    if (!body || !overlay) return;

    previousFocus = trigger instanceof HTMLElement ? trigger : document.activeElement;
    query('#guestInfoTitle').textContent = translate('guest.welcomeTitle', { title: request.title });
    query('#guestInfoSubtitle').textContent = translate('guest.welcomeText');
    body.replaceChildren();

    if (site.mockData) {
      const notice = document.createElement('aside');
      notice.className = 'info-box';
      notice.setAttribute('role', 'note');
      notice.append(createTextElement('strong', `${translate('guest.demoLabel')}: `));
      notice.append(document.createTextNode(translate('guest.mock')));
      body.appendChild(notice);
    }

    const grid = document.createElement('div');
    grid.className = 'guest-info-grid';

    const scheduleCard = createCard('guest.scheduleRoom');
    appendParagraph(scheduleCard, window.cmI18n?.date?.(request.date, {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    }) || request.date, { strong: true });
    appendParagraph(scheduleCard, translate('guest.timeRange', { start: request.start, end: request.end }));
    appendParagraph(
      scheduleCard,
      `${translateSource(room?.name || request.roomId || '—')} · ${translateSource(room?.floor || '')}`,
    );

    const addressCard = createCard('guest.address');
    appendParagraph(addressCard, site.address || translate('guest.ask'), { strong: true });
    appendParagraph(addressCard, site.publicTransport);
    appendParagraph(addressCard, site.carArrival);
    const routeUrl = safeExternalUrl(site.mapsUrl);
    if (routeUrl) {
      const paragraph = document.createElement('p');
      const link = createTextElement('a', translate('guest.route'));
      link.href = routeUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      paragraph.appendChild(link);
      addressCard.appendChild(paragraph);
    }

    const arrivalCard = createCard('guest.parking');
    appendParagraph(arrivalCard, site.parking);
    appendParagraph(arrivalCard, site.reception);
    appendParagraph(arrivalCard, site.building);
    appendParagraph(arrivalCard, site.visitorNotes);

    const contactCard = createCard('guest.contact');
    appendParagraph(contactCard, site.contact || translate('guest.contactDefault'), { strong: true });
    appendParagraph(contactCard, site.contactDetails);
    appendParagraph(contactCard, site.accessibility);

    grid.append(scheduleCard, addressCard, arrivalCard, contactCard);
    body.appendChild(grid);

    if (site.wifiName && site.wifiPassword) {
      const wifi = document.createElement('section');
      wifi.className = 'wifi-box';
      wifi.appendChild(createTextElement('h3', translate('guest.wifi')));

      const code = document.createElement('div');
      code.className = 'wifi-code';
      code.append(
        document.createTextNode(`${translate('guest.network')}: ${site.wifiName}`),
        document.createElement('br'),
        document.createTextNode(`${translate('guest.wifiCode')}: ${site.wifiPassword}`),
      );
      wifi.appendChild(code);
      appendParagraph(wifi, site.wifiInstructions);
      body.appendChild(wifi);
    }

    query('#guestInfoPdf').dataset.requestId = requestId;
    overlay.hidden = false;
    overlay.classList.add('open');
    query('#closeGuestInfo')?.focus();
  };

  const init = () => {
    injectStyles();
    ensureModal();
    decorateRequestButtons();

    const requestList = query('#requestList');
    if (requestList && !requestList.__guestAccessible) {
      const observer = new MutationObserver(decorateRequestButtons);
      observer.observe(requestList, { childList: true });
      requestList.__guestAccessible = observer;
    }

    document.addEventListener('click', (event) => {
      const button = event.target.closest('[data-guest-info]');
      if (!button) return;
      event.preventDefault();
      openGuestInfo(button.dataset.guestInfo, button);
    }, true);

    document.documentElement.dataset.guestA11yBuild = '2026.08.22.30';
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
