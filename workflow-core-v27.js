(() => {
  const REQUEST_KEY = 'conference_requests';
  const EDIT_KEY = 'conference_edit_request_v1';
  const query = (selector, root = document) => root.querySelector(selector);
  const translate = (key, values) => window.cmI18n?.t?.(key, values) ?? key;

  const todayIso = () => {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const readRequests = () => {
    try {
      const parsed = JSON.parse(localStorage.getItem(REQUEST_KEY) ?? '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  const getCatalogRooms = () => {
    try {
      return typeof catalog !== 'undefined' && Array.isArray(catalog?.rooms) ? catalog.rooms : [];
    } catch {
      return [];
    }
  };

  const overlaps = (startA, endA, startB, endB) => startA < endB && startB < endA;

  const createError = (step, element, key, values = {}) => ({ step, element, key, values });

  const validateSchedule = () => {
    const title = query('#title');
    const location = query('#location');
    const date = query('#date');
    const start = query('#start');
    const end = query('#end');
    const internal = query('#internalParticipants');
    const external = query('#externalParticipants');
    const internalCount = Number(internal?.value || 0);
    const externalCount = Number(external?.value || 0);
    const totalParticipants = internalCount + externalCount;

    if (!title?.value.trim()) return createError(1, title, 'validation.title');
    if (!location?.value) return createError(1, location, 'validation.location');
    if (!date?.value) return createError(1, date, 'validation.date');
    if (date.value < todayIso()) return createError(1, date, 'validation.dateFuture');
    if (internalCount < 0 || externalCount < 0) {
      return createError(1, internalCount < 0 ? internal : external, 'validation.negative');
    }
    if (!start?.value) return createError(1, start, 'validation.start');
    if (!end?.value || end.value <= start.value) return createError(1, end, 'validation.end');
    if (totalParticipants < 1) return createError(1, internal, 'validation.participants');

    return null;
  };

  const validateRoom = () => {
    const roomContainer = query('#rooms');
    const location = query('#location')?.value ?? '';
    const date = query('#date')?.value ?? '';
    const start = query('#start')?.value ?? '';
    const end = query('#end')?.value ?? '';
    const participants = Number(query('#internalParticipants')?.value || 0)
      + Number(query('#externalParticipants')?.value || 0);

    let selectedRoomId = null;
    try {
      selectedRoomId = state.roomId;
    } catch {
      return createError(2, roomContainer, 'validation.room');
    }

    if (!selectedRoomId) return createError(2, roomContainer, 'validation.room');

    const selectedRoom = getCatalogRooms().find((room) => room.id === selectedRoomId);
    const isCurrentCandidate = selectedRoom
      && selectedRoom.active !== false
      && selectedRoom.location === location
      && Number(selectedRoom.capacity || 0) >= participants;

    if (!isCurrentCandidate) {
      return createError(2, roomContainer, 'validation.roomChanged');
    }

    const editingRequestId = sessionStorage.getItem(EDIT_KEY);
    const hasConflict = readRequests().some((request) => (
      request.id !== editingRequestId
      && request.roomId === selectedRoomId
      && request.date === date
      && !['Rejected', 'Cancelled'].includes(request.status)
      && overlaps(start, end, request.start, request.end)
    ));

    return hasConflict ? createError(2, roomContainer, 'validation.roomBusy') : null;
  };

  const validateAllocations = () => {
    let allocations;
    try {
      allocations = Array.isArray(state.allocations) ? state.allocations : [];
    } catch {
      return createError(5, query('#allocations'), 'validation.alloc');
    }

    if (allocations.some((allocation) => !String(allocation.costCenter || '').trim())) {
      return createError(5, query('#allocations [data-cc]') || query('#allocations'), 'validation.centers');
    }

    if (allocations.some((allocation) => (
      !Number.isFinite(Number(allocation.percent))
      || Number(allocation.percent) < 0
      || Number(allocation.percent) > 100
    ))) {
      return createError(5, query('#allocations [data-pct]') || query('#allocations'), 'validation.percentRange');
    }

    const total = allocations.reduce((sum, allocation) => sum + Number(allocation.percent || 0), 0);
    return Math.abs(total - 100) > 0.01
      ? createError(5, query('#allocations'), 'validation.alloc')
      : null;
  };

  const validateStep = (step) => {
    if (step === 1) return validateSchedule();
    if (step === 2) return validateRoom();
    if (step === 5) return validateAllocations();
    return null;
  };

  const validate = () => validateSchedule() || validateRoom() || validateAllocations();

  const clearValidationState = () => {
    document.querySelectorAll('.field-error-v24').forEach((element) => {
      element.classList.remove('field-error-v24');
      element.removeAttribute('aria-invalid');
    });
    query('#validationSummaryV24')?.remove();
  };

  const showValidation = (validationError) => {
    clearValidationState();

    try {
      state.step = validationError.step;
      updateStep();
    } catch {
      // The base wizard owns step rendering. Failing safely leaves the current view unchanged.
    }

    const message = translate(validationError.key, validationError.values);
    const panel = query(`.step-panel[data-panel="${validationError.step}"]`);

    if (panel) {
      const summary = document.createElement('section');
      summary.id = 'validationSummaryV24';
      summary.className = 'validation-summary-v24';
      summary.setAttribute('role', 'alert');
      summary.setAttribute('aria-live', 'assertive');

      const heading = document.createElement('strong');
      heading.textContent = translate('validation.heading');
      const paragraph = document.createElement('p');
      paragraph.textContent = message;

      summary.append(heading, paragraph);
      panel.insertBefore(summary, panel.firstChild);
    }

    if (validationError.element instanceof HTMLElement) {
      validationError.element.classList.add('field-error-v24');
      validationError.element.setAttribute('aria-invalid', 'true');
      setTimeout(() => validationError.element.focus?.(), 0);
    }

    try {
      toast(message);
    } catch {
      // Toast is supplementary; the accessible inline alert remains the primary error channel.
    }

    return false;
  };

  const validateAndShow = () => {
    const validationError = validate();
    return validationError ? showValidation(validationError) : true;
  };

  const appendHistory = (request, status, note, at) => {
    const timestamp = at || new Date().toISOString();
    request.statusHistory = Array.isArray(request.statusHistory) ? request.statusHistory : [];
    request.timelineEvents = Array.isArray(request.timelineEvents) ? request.timelineEvents : [];

    const event = {
      status,
      calendarStatus: request.calendarStatus || '',
      at: timestamp,
      note: note || '',
    };

    const alreadyRecorded = request.statusHistory.some((entry) => (
      entry.status === event.status && entry.at === event.at && entry.note === event.note
    ));

    if (!alreadyRecorded) request.statusHistory.push(event);

    const timelineRecorded = request.timelineEvents.some((entry) => (
      entry.status === event.status && entry.at === event.at && entry.note === event.note
    ));

    if (!timelineRecorded) request.timelineEvents.push({
      status: event.status,
      at: event.at,
      note: event.note,
    });

    return timestamp;
  };

  window.cmWorkflow = {
    appendHistory,
    editing: () => sessionStorage.getItem(EDIT_KEY),
    showValidation,
    today: todayIso,
    validate,
    validateAndShow,
    validateStep,
  };

  document.documentElement.dataset.workflowCoreBuild = '2026.08.22.30';
})();
