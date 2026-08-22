(() => {
  const REQUEST_KEY = 'conference_requests';
  const query = (selector, root = document) => root.querySelector(selector);
  const queryAll = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const translate = (key, values) => window.cmI18n?.t?.(key, values) ?? key;
  const formatDateTime = (value) => window.cmI18n?.dateTime?.(value) ?? '';
  let listObserver = null;

  const readRequests = () => {
    try {
      const parsed = JSON.parse(localStorage.getItem(REQUEST_KEY) ?? '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  const saveRequests = (requests) => localStorage.setItem(REQUEST_KEY, JSON.stringify(requests));

  const requestIdFromCard = (card) => (
    query('.request-meta', card)?.textContent?.match(/CR-\d{4}-\d+/)?.[0] ?? null
  );

  const eventsFor = (request) => {
    const combined = [
      ...(Array.isArray(request.statusHistory) ? request.statusHistory : []),
      ...(Array.isArray(request.timelineEvents) ? request.timelineEvents : []),
    ];

    if (request.createdAt) combined.push({ status: 'Submitted', at: request.createdAt, note: '' });

    const seen = new Set();
    return combined
      .filter((event) => {
        const signature = `${event.status}|${event.at || ''}|${event.note || ''}`;
        if (seen.has(signature)) return false;
        seen.add(signature);
        return true;
      })
      .sort((left, right) => String(left.at || '').localeCompare(String(right.at || '')));
  };

  const lastEvent = (request, statuses) => (
    [...eventsFor(request)].reverse().find((event) => statuses.includes(event.status))
  );

  const timelineModel = (request) => {
    const submitted = lastEvent(request, ['Submitted']);
    const review = lastEvent(request, ['In Review', 'Change Requested', 'Confirmed', 'Rejected']);
    const result = lastEvent(request, ['Confirmed', 'Rejected', 'Cancelled', 'Change Requested']);
    const isTerminal = ['Confirmed', 'Rejected', 'Cancelled', 'Change Requested'].includes(request.status);
    const resultLabel = window.cmI18n?.status?.(request.status) ?? request.status;

    return [
      {
        label: translate('timeline.sent'),
        detail: formatDateTime(submitted?.at || request.createdAt) || translate('timeline.recorded'),
        state: 'done',
      },
      {
        label: translate('timeline.provisional'),
        detail: request.calendarStatus === 'Released'
          ? translate('timeline.released')
          : translate('timeline.held'),
        state: 'done',
      },
      {
        label: translate('timeline.review'),
        detail: request.status === 'Submitted'
          ? translate('status.submitted')
          : request.status === 'In Review'
            ? translate('status.review')
            : (formatDateTime(review?.at) || translate('timeline.processed')),
        state: ['Submitted', 'In Review'].includes(request.status) ? 'current' : 'done',
      },
      {
        label: isTerminal ? resultLabel : translate('timeline.pending'),
        detail: isTerminal
          ? (formatDateTime(result?.at) || translate('timeline.current'))
          : translate('timeline.open'),
        state: isTerminal
          ? (['Rejected', 'Cancelled'].includes(request.status) ? 'problem' : 'done')
          : '',
      },
    ];
  };

  const createTimeline = (request, card) => {
    const model = timelineModel(request);
    const signature = JSON.stringify(model);
    let section = query('.request-timeline', card);

    if (!section) {
      section = document.createElement('section');
      section.className = 'request-timeline';
      const actions = query('.request-actions', card);
      actions ? card.insertBefore(section, actions) : card.appendChild(section);
    }

    if (section.dataset.timelineSignature === signature) return;
    section.dataset.timelineSignature = signature;
    section.replaceChildren();

    const headingId = `timeline-${request.id}`;
    const heading = document.createElement('h4');
    heading.id = headingId;
    heading.className = 'request-timeline-title';
    heading.textContent = translate('timeline.title');

    const list = document.createElement('ol');
    list.className = 'request-timeline-list';
    list.setAttribute('aria-labelledby', headingId);

    model.forEach((item, index) => {
      const listItem = document.createElement('li');
      listItem.className = `request-timeline-step ${item.state}`.trim();
      if (item.state === 'current') listItem.setAttribute('aria-current', 'step');

      const label = document.createElement('strong');
      label.textContent = `${index + 1}. ${item.label}`;
      const detail = document.createElement('small');
      detail.textContent = item.detail;

      listItem.append(label, detail);
      list.appendChild(listItem);
    });

    section.append(heading, list);
  };

  const render = () => {
    const requestMap = new Map(readRequests().map((request) => [request.id, request]));
    queryAll('#requestList .request-card').forEach((card) => {
      const request = requestMap.get(requestIdFromCard(card));
      if (request) createTimeline(request, card);
    });
  };

  const captureConfirmed = () => {
    document.addEventListener('click', (event) => {
      const button = event.target.closest('[data-manager-action="confirm"]');
      if (!button) return;

      const requestId = button.dataset.requestId;
      setTimeout(() => {
        const requests = readRequests();
        const request = requests.find((item) => item.id === requestId);
        if (!request || request.status !== 'Confirmed') return;

        const alreadyRecorded = (request.statusHistory || []).some((entry) => entry.status === 'Confirmed');
        if (!alreadyRecorded) {
          window.cmWorkflow?.appendHistory?.(request, 'Confirmed', '', new Date().toISOString());
          saveRequests(requests);
        }

        render();
        window.dispatchEvent(new CustomEvent('conference-request-updated'));
      }, 100);
    }, true);
  };

  const init = () => {
    render();
    captureConfirmed();

    const requestList = query('#requestList');
    if (requestList && !listObserver) {
      listObserver = new MutationObserver(render);
      listObserver.observe(requestList, { childList: true });
    }

    window.addEventListener('conference-request-updated', () => setTimeout(render, 0));
    document.documentElement.dataset.timelineBuild = '2026.08.22.30';
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
