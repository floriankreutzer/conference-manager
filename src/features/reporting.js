const CLOSED_NEGATIVE = new Set(['Rejected', 'Cancelled']);
const OPEN_STATUSES = new Set(['Submitted', 'In Review', 'Change Requested']);

function toIso(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function atNoon(iso) {
  return new Date(`${iso}T12:00:00`);
}

function minutes(value) {
  const [hours, mins] = String(value || '00:00').split(':').map(Number);
  return (Number.isFinite(hours) ? hours : 0) * 60 + (Number.isFinite(mins) ? mins : 0);
}

export function reportRange(type, referenceIso) {
  const reference = atNoon(referenceIso);
  const year = reference.getFullYear();
  const month = reference.getMonth();
  let start;
  let end;

  switch (type) {
    case 'DAY':
      start = new Date(reference);
      end = new Date(reference);
      break;
    case 'QUARTER': {
      const startMonth = Math.floor(month / 3) * 3;
      start = new Date(year, startMonth, 1, 12);
      end = new Date(year, startMonth + 3, 0, 12);
      break;
    }
    case 'YEAR':
      start = new Date(year, 0, 1, 12);
      end = new Date(year, 11, 31, 12);
      break;
    case 'MONTH':
    default:
      start = new Date(year, month, 1, 12);
      end = new Date(year, month + 1, 0, 12);
      break;
  }

  return {
    type,
    start: toIso(start),
    end: toIso(end),
    days: Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1,
  };
}

export function totalParticipantsForRequest(request) {
  const explicit = Number(request?.participants);
  if (Number.isFinite(explicit) && explicit >= 0) return explicit;
  return Number(request?.internalParticipants || 0) + Number(request?.externalParticipants || 0);
}

export function cateringParticipantsForRequest(request) {
  const value = Number(request?.cateringParticipants);
  return value > 0 ? value : totalParticipantsForRequest(request);
}

export function buildReportModel({ requests = [], catalog = {}, range }) {
  const scoped = requests.filter((request) => request.date >= range.start && request.date <= range.end);
  const confirmed = scoped.filter((request) => request.status === 'Confirmed');
  const open = scoped.filter((request) => OPEN_STATUSES.has(request.status));
  const negative = scoped.filter((request) => CLOSED_NEGATIVE.has(request.status));
  const decisions = confirmed.length + negative.length;

  const rooms = new Map(
    (catalog.rooms || []).map((room) => [
      room.id,
      {
        id: room.id,
        name: room.name,
        active: room.active !== false,
        bookings: 0,
        hours: 0,
        participants: 0,
      },
    ]),
  );

  const services = new Map(
    (catalog.services || []).map((service) => [
      service.id,
      {
        id: service.id,
        name: service.name,
        active: service.active !== false,
        bookings: 0,
      },
    ]),
  );

  const packages = new Map();
  const items = new Map();
  let cateringBookings = 0;
  let cateringParticipants = 0;

  for (const request of confirmed) {
    const room = rooms.get(request.roomId);
    const participants = totalParticipantsForRequest(request);
    if (room) {
      room.bookings += 1;
      room.hours += Math.max(0, (minutes(request.end) - minutes(request.start)) / 60);
      room.participants += participants;
    }

    for (const serviceId of request.serviceIds || []) {
      const service = services.get(serviceId);
      if (service) service.bookings += 1;
    }

    let hasCatering = false;
    const cateringCount = cateringParticipantsForRequest(request);

    if (request.packageSelection) {
      hasCatering = true;
      const key = `${request.packageSelection.packageId || request.packageSelection.packageName || 'package'}:${request.packageSelection.tier || ''}`;
      const current = packages.get(key) || {
        key,
        packageId: request.packageSelection.packageId || '',
        name: request.packageSelection.packageName || request.packageSelection.packageId || '',
        tier: request.packageSelection.tier || '',
        bookings: 0,
        participants: 0,
      };
      current.bookings += 1;
      current.participants += cateringCount;
      packages.set(key, current);
    }

    for (const [itemId, rawQuantity] of Object.entries(request.quantities || {})) {
      const quantity = Number(rawQuantity || 0);
      if (quantity <= 0) continue;
      hasCatering = true;
      const source = (catalog.cateringItems || []).find((item) => item.id === itemId);
      const current = items.get(itemId) || {
        id: itemId,
        name: source?.name || itemId,
        unit: source?.unit || '',
        bookings: 0,
        quantity: 0,
      };
      current.bookings += 1;
      current.quantity += quantity;
      items.set(itemId, current);
    }

    if (hasCatering) {
      cateringBookings += 1;
      cateringParticipants += cateringCount;
    }
  }

  const roomRows = [...rooms.values()].sort((left, right) => right.bookings - left.bookings || right.hours - left.hours);
  const serviceRows = [...services.values()].sort((left, right) => right.bookings - left.bookings);
  const packageRows = [...packages.values()].sort((left, right) => right.bookings - left.bookings || right.participants - left.participants);
  const itemRows = [...items.values()].sort((left, right) => right.quantity - left.quantity || right.bookings - left.bookings);

  const activeRoomCount = Math.max(1, roomRows.filter((room) => room.active).length);
  const totalRoomHours = roomRows.reduce((sum, room) => sum + room.hours, 0);
  const utilization = Math.min(100, Math.max(0, (totalRoomHours / (activeRoomCount * range.days * 16)) * 100));
  const confirmationRate = decisions ? (confirmed.length / decisions) * 100 : 0;
  const negativeRate = scoped.length ? (negative.length / scoped.length) * 100 : 0;
  const cateringRate = confirmed.length ? (cateringBookings / confirmed.length) * 100 : 0;
  const participants = confirmed.reduce((sum, request) => sum + totalParticipantsForRequest(request), 0);

  return {
    scoped,
    confirmed,
    open,
    negative,
    roomRows,
    serviceRows,
    packageRows,
    itemRows,
    unusedRooms: roomRows.filter((room) => room.active && room.bookings === 0),
    unusedServices: serviceRows.filter((service) => service.active && service.bookings === 0),
    kpis: {
      confirmedBookings: confirmed.length,
      participants,
      confirmationRate,
      openRequests: open.length,
      utilization,
      negativeRate,
      cateringBookings,
      cateringRate,
      cateringParticipants,
    },
  };
}

export function managerOverview(requests, todayIso) {
  const end = atNoon(todayIso);
  end.setDate(end.getDate() + 7);
  const endIso = toIso(end);
  const active = requests.filter((request) => !CLOSED_NEGATIVE.has(request.status));

  return {
    action: active.filter((request) => ['Submitted', 'In Review'].includes(request.status)),
    today: active.filter((request) => request.date === todayIso),
    nextSevenDays: active.filter((request) => request.date >= todayIso && request.date <= endIso),
    upcoming: active.filter((request) => request.date >= todayIso),
    tentative: active.filter((request) => ['Tentative', 'Provisional'].includes(request.calendarStatus)),
    endIso,
  };
}
