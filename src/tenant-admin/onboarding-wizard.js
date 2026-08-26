import { t } from '../core/i18n.js';
import { announce, button, clear, el, showToast } from '../core/ui.js';

const STEPS = Object.freeze([
  'organization',
  'connection',
  'verification',
  'discovery',
  'import',
  'availability',
  'review',
]);

function statusChip(done) {
  return el('span', {
    className: `onboarding-status ${done ? 'is-complete' : 'is-pending'}`,
    text: t(done ? 'tenantAdmin.onboarding.complete' : 'tenantAdmin.onboarding.pending'),
  });
}

function stepCard(step, number, { done = false, current = false, children = [] } = {}) {
  const headingId = `onboarding-step-${step}`;
  return el('section', {
    className: `card onboarding-step-card${done ? ' is-complete' : ''}`,
    dataset: { onboardingStep: step },
    attrs: {
      'aria-labelledby': headingId,
      ...(current ? { 'aria-current': 'step' } : {}),
    },
  }, [
    el('header', { className: 'onboarding-step-header' }, [
      el('span', { className: 'onboarding-step-number', text: String(number) }),
      el('div', { className: 'onboarding-step-heading' }, [
        el('h3', { id: headingId, text: t(`tenantAdmin.onboarding.step.${step}.title`) }),
        el('p', { className: 'muted', text: t(`tenantAdmin.onboarding.step.${step}.description`) }),
      ]),
      statusChip(done),
    ]),
    ...children,
  ]);
}

function checkRow(labelKey, passed, { optional = false } = {}) {
  return el('li', { className: 'onboarding-check-row' }, [
    el('span', {
      className: `onboarding-check-marker ${passed ? 'is-complete' : 'is-pending'}`,
      attrs: { 'aria-hidden': 'true' },
      text: passed ? '✓' : '–',
    }),
    el('span', { text: t(labelKey) }),
    optional ? el('span', { className: 'muted', text: t('tenantAdmin.onboarding.optional') }) : null,
  ]);
}

function connectionComplete(connection) {
  return connection?.state === 'connected'
    && connection.permissions?.place === 'granted'
    && connection.permissions?.calendars === 'granted';
}

function firstIncomplete(readiness, discoveredRooms) {
  if (!readiness.checks.tenantIdentityClaimed) return 'organization';
  if (!readiness.checks.microsoft365Connected) return 'connection';
  if (!readiness.checks.placesPermissionGranted || !readiness.checks.calendarPermissionGranted) return 'verification';
  if (!readiness.checks.roomImported && discoveredRooms.length === 0) return 'discovery';
  if (!readiness.checks.roomImported) return 'import';
  if (!readiness.checks.freeBusyVerified) return 'availability';
  return 'review';
}

function selectedRoomPayload(room, siteId, capacity) {
  const normalizedCapacity = Number(capacity);
  if (!Number.isSafeInteger(normalizedCapacity) || normalizedCapacity < 1 || normalizedCapacity > 100_000) {
    throw new TypeError('ROOM_CAPACITY_INVALID');
  }
  return Object.freeze({
    externalRoomId: room.id,
    siteId,
    name: room.name,
    capacity: normalizedCapacity,
  });
}

export function createTenantOnboardingWizard({ runtime, onChanged } = {}) {
  if (!runtime || typeof runtime.getReadiness !== 'function' || typeof runtime.verifyFreeBusy !== 'function') {
    throw new TypeError('ONBOARDING_RUNTIME_REQUIRED');
  }
  if (onChanged !== undefined && typeof onChanged !== 'function') {
    throw new TypeError('ONBOARDING_CHANGE_HANDLER_INVALID');
  }

  let generation = 0;
  let discoveredRooms = [];
  let selectedRoomIds = new Set();
  let selectedSiteId = '';
  let capacities = new Map();

  function loading() {
    return el('section', {
      className: 'card onboarding-loading',
      attrs: { role: 'status', 'aria-live': 'polite' },
    }, [el('p', { text: t('tenantAdmin.onboarding.loading') })]);
  }

  function errorPanel(retry) {
    const retryButton = button(t('tenantAdmin.onboarding.retry'), { className: 'primary' });
    retryButton.addEventListener('click', retry);
    return el('section', { className: 'card onboarding-error', attrs: { role: 'alert' } }, [
      el('h3', { text: t('tenantAdmin.onboarding.errorTitle') }),
      el('p', { text: t('tenantAdmin.onboarding.error') }),
      retryButton,
    ]);
  }

  function connectionActions(connection, render) {
    const actions = el('div', { className: 'button-row onboarding-actions' });
    const message = el('p', { className: 'field-hint', attrs: { 'aria-live': 'polite' } });
    const connect = button(
      t(connection.state === 'disconnected'
        ? 'tenantAdmin.onboarding.connect'
        : 'tenantAdmin.onboarding.reconnect'),
      { className: 'primary' },
    );
    connect.addEventListener('click', async () => {
      connect.disabled = true;
      message.textContent = t('tenantAdmin.onboarding.connecting');
      try {
        const result = await runtime.connect();
        if (typeof result?.authorizationUrl === 'string') {
          globalThis.location.assign(result.authorizationUrl);
          return;
        }
        showToast(t('tenantAdmin.onboarding.demoConnected'));
        await render();
      } catch {
        message.textContent = t('tenantAdmin.onboarding.connectionError');
        announce(message.textContent, { assertive: true });
        connect.disabled = false;
      }
    });
    actions.appendChild(connect);
    return [actions, message];
  }

  function verificationActions(connection, render) {
    const actions = el('div', { className: 'button-row onboarding-actions' });
    const message = el('p', { className: 'field-hint', attrs: { 'aria-live': 'polite' } });
    const verify = button(t('tenantAdmin.onboarding.verify'), { className: 'primary' });
    verify.disabled = connection.state === 'disconnected';
    verify.addEventListener('click', async () => {
      verify.disabled = true;
      message.textContent = t('tenantAdmin.onboarding.verifying');
      try {
        await runtime.verify();
        showToast(t('tenantAdmin.onboarding.verified'));
        await render();
      } catch {
        message.textContent = t('tenantAdmin.onboarding.verificationError');
        announce(message.textContent, { assertive: true });
        verify.disabled = false;
      }
    });
    actions.appendChild(verify);
    return [actions, message];
  }

  function discoveryActions(readiness, mappings, render) {
    const importedIds = new Set(mappings.filter((entry) => entry.providerStatus === 'active')
      .map((entry) => entry.externalRoomId));
    const actions = el('div', { className: 'button-row onboarding-actions' });
    const message = el('p', { className: 'field-hint', attrs: { 'aria-live': 'polite' } });
    const discover = button(t('tenantAdmin.onboarding.discoverRooms'), { className: 'primary' });
    discover.disabled = !readiness.checks.placesPermissionGranted;
    discover.addEventListener('click', async () => {
      discover.disabled = true;
      message.textContent = t('tenantAdmin.onboarding.discoveringRooms');
      try {
        discoveredRooms = await runtime.discoverRooms();
        selectedRoomIds = new Set(discoveredRooms
          .filter((room) => !importedIds.has(room.id))
          .map((room) => room.id));
        capacities = new Map(discoveredRooms.map((room) => [room.id, room.capacity || 1]));
        const result = t('tenantAdmin.onboarding.roomsFound', { count: discoveredRooms.length });
        showToast(result);
        announce(result);
        await render();
      } catch {
        message.textContent = t('tenantAdmin.onboarding.roomDiscoveryError');
        announce(message.textContent, { assertive: true });
        discover.disabled = !readiness.checks.placesPermissionGranted;
      }
    });
    actions.appendChild(discover);
    return [actions, message];
  }

  function importSurface(sites, mappings, readiness, render) {
    const importedIds = new Set(mappings.filter((entry) => entry.providerStatus === 'active')
      .map((entry) => entry.externalRoomId));
    const wrapper = el('div', { className: 'onboarding-room-surface' });
    if (readiness.checks.roomImported) {
      wrapper.appendChild(el('ul', { className: 'onboarding-check-list' }, [
        checkRow('tenantAdmin.onboarding.check.roomImported', true),
      ]));
      return wrapper;
    }
    if (!discoveredRooms.length) {
      wrapper.appendChild(el('p', { className: 'muted', text: t('tenantAdmin.onboarding.discoveryRequired') }));
      return wrapper;
    }

    const siteField = el('label', { className: 'field onboarding-site-field' }, [
      el('span', { text: t('tenantAdmin.onboarding.site') }),
    ]);
    const siteSelect = el('select');
    siteSelect.appendChild(el('option', { value: '', text: t('tenantAdmin.onboarding.selectSite') }));
    sites.forEach((site) => siteSelect.appendChild(el('option', { value: site.id, text: site.name })));
    if (!selectedSiteId && sites.length === 1) selectedSiteId = sites[0].id;
    siteSelect.value = selectedSiteId;
    siteSelect.addEventListener('change', () => { selectedSiteId = siteSelect.value; });
    siteField.appendChild(siteSelect);

    const list = el('fieldset', { className: 'onboarding-room-list' });
    list.appendChild(el('legend', { text: t('tenantAdmin.onboarding.selectRooms') }));
    discoveredRooms.forEach((room) => {
      const alreadyImported = importedIds.has(room.id);
      const inputId = `onboarding-room-${room.id.replace(/[^A-Za-z0-9_-]/g, '-')}`;
      const checkbox = el('input', {
        type: 'checkbox',
        checked: selectedRoomIds.has(room.id),
        disabled: alreadyImported,
      });
      checkbox.id = inputId;
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) selectedRoomIds.add(room.id);
        else selectedRoomIds.delete(room.id);
      });
      const capacity = el('input', {
        type: 'number',
        value: String(capacities.get(room.id) || room.capacity || 1),
        attrs: {
          min: '1',
          max: '100000',
          inputmode: 'numeric',
          'aria-label': t('tenantAdmin.onboarding.capacityFor', { name: room.name }),
        },
      });
      capacity.addEventListener('input', () => capacities.set(room.id, Number(capacity.value)));
      const metadata = [room.building, room.floorLabel, room.address].filter(Boolean).join(' · ');
      list.appendChild(el('div', { className: 'onboarding-room-option' }, [
        el('label', { attrs: { for: inputId } }, [checkbox, el('span', {}, [
          el('strong', { text: room.name }),
          el('small', { text: alreadyImported ? t('tenantAdmin.onboarding.alreadyImported') : metadata }),
        ])]),
        capacity,
      ]));
    });

    const importButton = button(t('tenantAdmin.onboarding.importSelected'), { className: 'primary' });
    const importMessage = el('p', { className: 'field-hint', attrs: { 'aria-live': 'polite' } });
    importButton.addEventListener('click', async () => {
      const selected = discoveredRooms.filter((room) => selectedRoomIds.has(room.id) && !importedIds.has(room.id));
      if (!selectedSiteId) {
        importMessage.textContent = t('tenantAdmin.onboarding.siteRequired');
        announce(importMessage.textContent, { assertive: true });
        siteSelect.focus();
        return;
      }
      if (!selected.length) {
        importMessage.textContent = t('tenantAdmin.onboarding.roomRequired');
        announce(importMessage.textContent, { assertive: true });
        return;
      }
      importButton.disabled = true;
      importMessage.textContent = t('tenantAdmin.onboarding.importing');
      try {
        const payload = selected.map((room) => selectedRoomPayload(room, selectedSiteId, capacities.get(room.id)));
        await runtime.importRooms(payload);
        showToast(t('tenantAdmin.onboarding.imported', { count: payload.length }));
        discoveredRooms = [];
        selectedRoomIds = new Set();
        onChanged?.();
        await render();
      } catch {
        importMessage.textContent = t('tenantAdmin.onboarding.importError');
        announce(importMessage.textContent, { assertive: true });
        importButton.disabled = false;
      }
    });
    wrapper.append(
      siteField,
      list,
      el('div', { className: 'button-row onboarding-actions' }, [importButton]),
      importMessage,
    );
    return wrapper;
  }

  function availabilityActions(readiness, render) {
    const actions = el('div', { className: 'button-row onboarding-actions' });
    const message = el('p', { className: 'field-hint', attrs: { 'aria-live': 'polite' } });
    const verify = button(t('tenantAdmin.onboarding.verifyAvailability'), { className: 'primary' });
    verify.disabled = !readiness.checks.roomImported || !readiness.checks.calendarPermissionGranted;
    verify.addEventListener('click', async () => {
      verify.disabled = true;
      message.textContent = t('tenantAdmin.onboarding.verifyingAvailability');
      try {
        await runtime.verifyFreeBusy();
        showToast(t('tenantAdmin.onboarding.availabilityVerified'));
        onChanged?.();
        await render();
      } catch {
        message.textContent = t('tenantAdmin.onboarding.availabilityError');
        announce(message.textContent, { assertive: true });
        verify.disabled = false;
      }
    });
    actions.appendChild(verify);
    return [actions, message];
  }

  async function renderInto(root) {
    if (!(root instanceof HTMLElement)) throw new TypeError('ONBOARDING_ROOT_REQUIRED');
    const currentGeneration = ++generation;
    clear(root);
    root.appendChild(loading());
    try {
      const [sites, connection, mappings, readiness] = await Promise.all([
        runtime.listSites(),
        runtime.getConnection(),
        runtime.listMappings(),
        runtime.getReadiness(),
      ]);
      if (currentGeneration !== generation) return;
      clear(root);
      const currentStep = firstIncomplete(readiness, discoveredRooms);
      root.appendChild(el('section', { className: 'onboarding-hero' }, [
        el('div', {}, [
          el('p', { className: 'eyebrow', text: t('tenantAdmin.onboarding.eyebrow') }),
          el('h2', { text: t('tenantAdmin.onboarding.title') }),
          el('p', { text: t('tenantAdmin.onboarding.description') }),
        ]),
        runtime.isDemo
          ? el('p', { className: 'onboarding-demo-note', text: t('tenantAdmin.onboarding.demoNote') })
          : null,
      ]));

      const progress = el('ol', {
        className: 'onboarding-progress',
        attrs: { 'aria-label': t('tenantAdmin.onboarding.progress') },
      });
      STEPS.forEach((step) => {
        const item = el('li', { text: t(`tenantAdmin.onboarding.step.${step}.short`) });
        if (step === currentStep) item.setAttribute('aria-current', 'step');
        progress.appendChild(item);
      });
      root.appendChild(progress);

      const organizationDone = readiness.checks.tenantIdentityClaimed;
      root.appendChild(stepCard('organization', 1, {
        done: organizationDone,
        current: currentStep === 'organization',
        children: [checkRow('tenantAdmin.onboarding.check.identity', organizationDone)],
      }));
      root.appendChild(stepCard('connection', 2, {
        done: readiness.checks.microsoft365Connected,
        current: currentStep === 'connection',
        children: [
          el('p', { className: 'status-chip', text: t(`tenantAdmin.microsoft365.state.${connection.state}`) }),
          ...connectionActions(connection, () => renderInto(root)),
        ],
      }));
      root.appendChild(stepCard('verification', 3, {
        done: connectionComplete(connection),
        current: currentStep === 'verification',
        children: [
          el('ul', { className: 'onboarding-check-list' }, [
            checkRow('tenantAdmin.onboarding.check.places', readiness.checks.placesPermissionGranted),
            checkRow('tenantAdmin.onboarding.check.calendar', readiness.checks.calendarPermissionGranted),
          ]),
          ...verificationActions(connection, () => renderInto(root)),
        ],
      }));

      const discoveryDone = readiness.checks.roomImported || discoveredRooms.length > 0;
      root.appendChild(stepCard('discovery', 4, {
        done: discoveryDone,
        current: currentStep === 'discovery',
        children: [
          el('p', {
            className: 'muted',
            text: discoveredRooms.length > 0
              ? t('tenantAdmin.onboarding.roomsFound', { count: discoveredRooms.length })
              : t('tenantAdmin.onboarding.noRoomsLoaded'),
          }),
          ...discoveryActions(readiness, mappings, () => renderInto(root)),
        ],
      }));
      root.appendChild(stepCard('import', 5, {
        done: readiness.checks.roomImported,
        current: currentStep === 'import',
        children: [importSurface(sites, mappings, readiness, () => renderInto(root))],
      }));
      root.appendChild(stepCard('availability', 6, {
        done: readiness.checks.freeBusyVerified,
        current: currentStep === 'availability',
        children: [
          el('ul', { className: 'onboarding-check-list' }, [
            checkRow('tenantAdmin.onboarding.check.freeBusy', readiness.checks.freeBusyVerified),
          ]),
          ...availabilityActions(readiness, () => renderInto(root)),
        ],
      }));

      const requiredReady = readiness.checks.directoryEntitled && readiness.checks.calendarEntitled;
      root.appendChild(stepCard('review', 7, {
        done: readiness.ready,
        current: currentStep === 'review',
        children: [
          el('ul', { className: 'onboarding-check-list' }, [
            checkRow('tenantAdmin.onboarding.check.directoryEntitlement', readiness.checks.directoryEntitled),
            checkRow('tenantAdmin.onboarding.check.calendarEntitlement', readiness.checks.calendarEntitled),
            checkRow(
              'tenantAdmin.onboarding.check.calendarWriteEntitlement',
              readiness.entitlements.microsoftCalendarWrite,
              { optional: true },
            ),
          ]),
          el('div', {
            className: `onboarding-readiness ${readiness.ready ? 'is-ready' : 'is-blocked'}`,
            attrs: { role: 'status', 'aria-live': 'polite' },
          }, [
            el('strong', { text: t(readiness.ready
              ? 'tenantAdmin.onboarding.readyTitle'
              : 'tenantAdmin.onboarding.notReadyTitle') }),
            el('p', { text: t(readiness.ready
              ? 'tenantAdmin.onboarding.readyText'
              : 'tenantAdmin.onboarding.notReadyText') }),
            requiredReady
              ? null
              : el('p', { className: 'muted', text: t('tenantAdmin.onboarding.entitlementHint') }),
          ]),
        ],
      }));
    } catch {
      if (currentGeneration !== generation) return;
      clear(root);
      root.appendChild(errorPanel(() => renderInto(root)));
    }
  }

  return Object.freeze({ renderInto });
}
