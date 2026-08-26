import { t } from '../core/i18n.js';
import { announce, button, clear, el, showToast } from '../core/ui.js';
import { connectionRecoveryKey, onboardingErrorKey } from './onboarding-error.js';

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
        el('h3', {
          id: headingId,
          text: t(`tenantAdmin.onboarding.step.${step}.title`),
          attrs: { tabindex: '-1' },
        }),
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
    el('span', {
      className: 'sr-only',
      text: t(passed ? 'tenantAdmin.onboarding.complete' : 'tenantAdmin.onboarding.pending'),
    }),
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
  if (
    !runtime
    || typeof runtime.getReadiness !== 'function'
    || typeof runtime.verifyFreeBusy !== 'function'
    || typeof runtime.disconnect !== 'function'
  ) {
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
  let mutationInFlight = false;

  function registerMutationControl(control) {
    control.dataset.onboardingMutation = '';
    control.dataset.onboardingDefaultDisabled = control.disabled ? 'true' : 'false';
    control.disabled = mutationInFlight || control.disabled;
    return control;
  }

  function setMutationControls(root, pending) {
    root.querySelectorAll('[data-onboarding-mutation]').forEach((control) => {
      control.disabled = pending || control.dataset.onboardingDefaultDisabled === 'true';
    });
  }

  async function runMutation(root, operation) {
    if (mutationInFlight) return false;
    mutationInFlight = true;
    setMutationControls(root, true);
    try {
      await operation();
      return true;
    } finally {
      mutationInFlight = false;
      if (root.isConnected) setMutationControls(root, false);
    }
  }

  function showOperationError(message, error, operation) {
    message.textContent = t(onboardingErrorKey(error, operation));
    announce(message.textContent, { assertive: true });
  }

  function permissionExplanation() {
    return el('section', { className: 'info-box onboarding-permissions' }, [
      el('h4', { text: t('tenantAdmin.onboarding.requiredPermissions') }),
      el('ul', {}, [
        el('li', { text: t('tenantAdmin.onboarding.permission.placesReason') }),
        el('li', { text: t('tenantAdmin.onboarding.permission.calendarReason') }),
        el('li', { text: t('tenantAdmin.onboarding.permission.calendarWriteOptional') }),
      ]),
    ]);
  }

  function loading() {
    return el('section', {
      className: 'card onboarding-loading',
      attrs: { role: 'status', 'aria-live': 'polite' },
    }, [el('p', { text: t('tenantAdmin.onboarding.loading') })]);
  }

  function errorPanel(retry, error) {
    const retryButton = button(t('tenantAdmin.onboarding.retry'), { className: 'primary' });
    retryButton.addEventListener('click', retry);
    return el('section', { className: 'card onboarding-error', attrs: { role: 'alert' } }, [
      el('h3', { text: t('tenantAdmin.onboarding.errorTitle') }),
      el('p', { text: t(onboardingErrorKey(error, 'load')) }),
      retryButton,
    ]);
  }

  function connectionActions(root, connection, render, isActive) {
    const actions = el('div', { className: 'button-row onboarding-actions' });
    const message = el('p', { className: 'field-hint', attrs: { 'aria-live': 'polite' } });
    const connect = registerMutationControl(button(
      t(connection.state === 'disconnected'
        ? 'tenantAdmin.onboarding.connect'
        : 'tenantAdmin.onboarding.reconnect'),
      { className: 'primary' },
    ));
    connect.addEventListener('click', async () => {
      await runMutation(root, async () => {
        message.textContent = t('tenantAdmin.onboarding.connecting');
        try {
          const result = await runtime.connect();
          if (!isActive()) return;
          if (typeof result?.authorizationUrl === 'string') {
            globalThis.location.assign(result.authorizationUrl);
            return;
          }
          showToast(t('tenantAdmin.onboarding.demoConnected'));
          await render();
        } catch (error) {
          if (!isActive()) return;
          showOperationError(message, error, 'connect');
        }
      });
    });
    actions.appendChild(connect);
    if (connection.state !== 'disconnected') {
      const disconnect = registerMutationControl(button(t('tenantAdmin.onboarding.disconnect')));
      disconnect.addEventListener('click', async () => {
        await runMutation(root, async () => {
          message.textContent = t('tenantAdmin.onboarding.disconnecting');
          try {
            await runtime.disconnect();
            if (!isActive()) return;
            discoveredRooms = [];
            selectedRoomIds = new Set();
            showToast(t('tenantAdmin.onboarding.disconnected'));
            onChanged?.();
            await render();
          } catch (error) {
            if (!isActive()) return;
            showOperationError(message, error, 'disconnect');
          }
        });
      });
      actions.appendChild(disconnect);
    }
    return [actions, message];
  }

  function verificationActions(root, connection, render, isActive) {
    const actions = el('div', { className: 'button-row onboarding-actions' });
    const message = el('p', { className: 'field-hint', attrs: { 'aria-live': 'polite' } });
    const verify = button(t('tenantAdmin.onboarding.verify'), { className: 'primary' });
    verify.disabled = connection.state === 'disconnected';
    registerMutationControl(verify);
    verify.addEventListener('click', async () => {
      await runMutation(root, async () => {
        message.textContent = t('tenantAdmin.onboarding.verifying');
        try {
          await runtime.verify();
          if (!isActive()) return;
          showToast(t('tenantAdmin.onboarding.verified'));
          await render();
        } catch (error) {
          if (!isActive()) return;
          showOperationError(message, error, 'verify');
        }
      });
    });
    actions.appendChild(verify);
    return [actions, message];
  }

  function discoveryActions(root, readiness, mappings, render, isActive) {
    const importedIds = new Set(mappings.filter((entry) => entry.providerStatus === 'active')
      .map((entry) => entry.externalRoomId));
    const actions = el('div', { className: 'button-row onboarding-actions' });
    const message = el('p', { className: 'field-hint', attrs: { 'aria-live': 'polite' } });
    const discover = button(t('tenantAdmin.onboarding.discoverRooms'), { className: 'primary' });
    discover.disabled = !readiness.checks.placesPermissionGranted;
    registerMutationControl(discover);
    discover.addEventListener('click', async () => {
      await runMutation(root, async () => {
        message.textContent = t('tenantAdmin.onboarding.discoveringRooms');
        try {
          const rooms = await runtime.discoverRooms();
          if (!isActive()) return;
          discoveredRooms = rooms;
          selectedRoomIds = new Set(discoveredRooms
            .filter((room) => !importedIds.has(room.id))
            .map((room) => room.id));
          capacities = new Map(discoveredRooms.map((room) => [room.id, room.capacity || 1]));
          const result = t('tenantAdmin.onboarding.roomsFound', { count: discoveredRooms.length });
          showToast(result);
          announce(result);
          await render();
        } catch (error) {
          if (!isActive()) return;
          showOperationError(message, error, 'discover');
        }
      });
    });
    actions.appendChild(discover);
    return [actions, message];
  }

  function importSurface(root, sites, mappings, readiness, render, isActive) {
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
    const importMessageId = 'onboarding-import-message';
    siteSelect.setAttribute('aria-describedby', importMessageId);
    siteSelect.addEventListener('change', () => {
      selectedSiteId = siteSelect.value;
      siteSelect.removeAttribute('aria-invalid');
      importMessage.textContent = '';
    });
    siteField.appendChild(siteSelect);

    const list = el('fieldset', { className: 'onboarding-room-list' });
    list.setAttribute('aria-describedby', importMessageId);
    list.appendChild(el('legend', { text: t('tenantAdmin.onboarding.selectRooms') }));
    const capacityControls = new Map();
    discoveredRooms.forEach((room, roomIndex) => {
      const alreadyImported = importedIds.has(room.id);
      const inputId = `onboarding-room-${roomIndex + 1}`;
      const capacityId = `onboarding-room-capacity-${roomIndex + 1}`;
      const checkbox = el('input', {
        type: 'checkbox',
        checked: selectedRoomIds.has(room.id),
        disabled: alreadyImported,
      });
      checkbox.id = inputId;
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) selectedRoomIds.add(room.id);
        else selectedRoomIds.delete(room.id);
        list.removeAttribute('aria-invalid');
        importMessage.textContent = '';
      });
      const capacity = el('input', {
        id: capacityId,
        type: 'number',
        value: String(capacities.get(room.id) || room.capacity || 1),
        attrs: {
          min: '1',
          max: '100000',
          inputmode: 'numeric',
          'aria-label': t('tenantAdmin.onboarding.capacityFor', { name: room.name }),
          'aria-describedby': importMessageId,
        },
      });
      capacityControls.set(room.id, capacity);
      capacity.addEventListener('input', () => {
        capacities.set(room.id, Number(capacity.value));
        capacity.removeAttribute('aria-invalid');
        importMessage.textContent = '';
      });
      const metadata = [room.building, room.floorLabel, room.address].filter(Boolean).join(' · ');
      list.appendChild(el('div', { className: 'onboarding-room-option' }, [
        el('label', { attrs: { for: inputId } }, [checkbox, el('span', {}, [
          el('strong', { text: room.name }),
          el('small', { text: alreadyImported ? t('tenantAdmin.onboarding.alreadyImported') : metadata }),
        ])]),
        capacity,
      ]));
    });

    const importButton = registerMutationControl(button(
      t('tenantAdmin.onboarding.importSelected'),
      { className: 'primary' },
    ));
    const importMessage = el('p', {
      id: importMessageId,
      className: 'field-hint',
      attrs: { role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' },
    });
    importButton.addEventListener('click', async () => {
      const selected = discoveredRooms.filter((room) => selectedRoomIds.has(room.id) && !importedIds.has(room.id));
      siteSelect.removeAttribute('aria-invalid');
      list.removeAttribute('aria-invalid');
      capacityControls.forEach((control) => control.removeAttribute('aria-invalid'));
      if (!selectedSiteId) {
        importMessage.textContent = t('tenantAdmin.onboarding.siteRequired');
        siteSelect.setAttribute('aria-invalid', 'true');
        announce(importMessage.textContent, { assertive: true });
        siteSelect.focus();
        return;
      }
      if (!selected.length) {
        importMessage.textContent = t('tenantAdmin.onboarding.roomRequired');
        list.setAttribute('aria-invalid', 'true');
        announce(importMessage.textContent, { assertive: true });
        list.querySelector('input[type="checkbox"]:not([disabled])')?.focus();
        return;
      }
      const invalidCapacityRoom = selected.find((room) => {
        const value = capacities.get(room.id);
        return !Number.isSafeInteger(value) || value < 1 || value > 100_000;
      });
      if (invalidCapacityRoom) {
        importMessage.textContent = t('tenantAdmin.onboarding.capacityInvalid');
        const invalidControl = capacityControls.get(invalidCapacityRoom.id);
        invalidControl?.setAttribute('aria-invalid', 'true');
        announce(importMessage.textContent, { assertive: true });
        invalidControl?.focus();
        return;
      }
      await runMutation(root, async () => {
        importMessage.textContent = t('tenantAdmin.onboarding.importing');
        try {
          const payload = selected.map((room) => selectedRoomPayload(room, selectedSiteId, capacities.get(room.id)));
          await runtime.importRooms(payload);
          if (!isActive()) return;
          showToast(t('tenantAdmin.onboarding.imported', { count: payload.length }));
          discoveredRooms = [];
          selectedRoomIds = new Set();
          onChanged?.();
          await render();
        } catch (error) {
          if (!isActive()) return;
          showOperationError(importMessage, error, 'import');
        }
      });
    });
    wrapper.append(
      siteField,
      list,
      el('div', { className: 'button-row onboarding-actions' }, [importButton]),
      importMessage,
    );
    return wrapper;
  }

  function availabilityActions(root, readiness, render, isActive) {
    const actions = el('div', { className: 'button-row onboarding-actions' });
    const message = el('p', { className: 'field-hint', attrs: { 'aria-live': 'polite' } });
    const verify = button(t('tenantAdmin.onboarding.verifyAvailability'), { className: 'primary' });
    verify.disabled = !readiness.checks.roomImported || !readiness.checks.calendarPermissionGranted;
    registerMutationControl(verify);
    verify.addEventListener('click', async () => {
      await runMutation(root, async () => {
        message.textContent = t('tenantAdmin.onboarding.verifyingAvailability');
        try {
          await runtime.verifyFreeBusy();
          if (!isActive()) return;
          showToast(t('tenantAdmin.onboarding.availabilityVerified'));
          onChanged?.();
          await render();
        } catch (error) {
          if (!isActive()) return;
          showOperationError(message, error, 'availability');
        }
      });
    });
    actions.appendChild(verify);
    return [actions, message];
  }

  async function renderInto(root, { focusCurrentStep = false } = {}) {
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
      const isActive = () => currentGeneration === generation && root.isConnected;
      const renderWithFocus = () => renderInto(root, { focusCurrentStep: true });
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
      const recoveryKey = connectionRecoveryKey(connection);
      root.appendChild(stepCard('organization', 1, {
        done: organizationDone,
        current: currentStep === 'organization',
        children: [el('ul', { className: 'onboarding-check-list' }, [
          checkRow('tenantAdmin.onboarding.check.identity', organizationDone),
        ])],
      }));
      root.appendChild(stepCard('connection', 2, {
        done: readiness.checks.microsoft365Connected,
        current: currentStep === 'connection',
        children: [
          el('p', { className: 'status-chip', text: t(`tenantAdmin.microsoft365.state.${connection.state}`) }),
          permissionExplanation(),
          recoveryKey ? el('p', { className: 'error-box', attrs: { role: 'status' }, text: t(recoveryKey) }) : null,
          ...connectionActions(root, connection, renderWithFocus, isActive),
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
          ...verificationActions(root, connection, renderWithFocus, isActive),
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
          ...discoveryActions(root, readiness, mappings, renderWithFocus, isActive),
        ],
      }));
      root.appendChild(stepCard('import', 5, {
        done: readiness.checks.roomImported,
        current: currentStep === 'import',
        children: [importSurface(root, sites, mappings, readiness, renderWithFocus, isActive)],
      }));
      root.appendChild(stepCard('availability', 6, {
        done: readiness.checks.freeBusyVerified,
        current: currentStep === 'availability',
        children: [
          el('ul', { className: 'onboarding-check-list' }, [
            checkRow('tenantAdmin.onboarding.check.freeBusy', readiness.checks.freeBusyVerified),
          ]),
          ...availabilityActions(root, readiness, renderWithFocus, isActive),
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
      if (focusCurrentStep) {
        requestAnimationFrame(() => {
          if (currentGeneration !== generation || !root.isConnected) return;
          [...root.querySelectorAll('[data-onboarding-step]')]
            .find((card) => card.dataset.onboardingStep === currentStep)
            ?.querySelector('h3')
            ?.focus();
        });
      }
    } catch (error) {
      if (currentGeneration !== generation) return;
      clear(root);
      root.appendChild(errorPanel(() => renderInto(root, { focusCurrentStep: true }), error));
    }
  }

  return Object.freeze({ renderInto });
}
