import { productionUtcInstant } from '../core/production-time.js';
import { siteLocalIsoDate } from './server-room-plan.js';

const OPEN = new Set(['Submitted', 'In Review', 'Change Requested']);
const CLOSED = new Set(['Cancelled', 'Rejected']);

export function reportSiteOptions(catalog) {
  return catalog.sites.filter((site) => site.timeZone);
}

export function roomPlanSiteOptions(catalog) {
  const sitesWithCurrentRooms = new Set(catalog.rooms.map((room) => room.siteId));
  return reportSiteOptions(catalog).filter((site) => sitesWithCurrentRooms.has(site.id));
}

function shiftedDate(value, days) {
  return new Date(Date.parse(`${value}T12:00:00.000Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

export function requestSite(request, catalog, context = null) {
  const room = catalog.rooms.find((entry) => entry.id === request.roomId)
    || context?.room || request.pricing?.room;
  return catalog.sites.find((entry) => entry.id === room?.siteId) || context?.site || null;
}

export function managerCockpitModel({ requests, catalog, roomContexts = [], changes = [], now = Date.now() }) {
  const entries = requests.map((request, index) => {
    const site = requestSite(request, catalog, roomContexts[index]);
    const room = catalog.rooms.find((entry) => entry.id === request.roomId)
      || roomContexts[index]?.room || request.pricing?.room;
    const today = site ? siteLocalIsoDate(now, site.timeZone) : null;
    const date = site ? siteLocalIsoDate(Date.parse(request.startsAt), site.timeZone) : null;
    const active = !CLOSED.has(request.status);
    return {
      request, index, room, site,
      open: OPEN.has(request.status),
      action: ['Submitted', 'In Review'].includes(request.status) || changes[index]?.status === 'pending',
      today: active && date !== null && date === today,
      upcoming: active && Date.parse(request.endsAt) > now,
      nextSevenDays: active && date !== null && date >= today && date < shiftedDate(today, 7),
    };
  });
  const byStart = (a, b) => Date.parse(a.request.startsAt) - Date.parse(b.request.startsAt);
  return {
    entries,
    action: entries.filter((entry) => entry.action).sort(byStart),
    upcoming: entries.filter((entry) => entry.upcoming).sort(byStart),
    today: entries.filter((entry) => entry.today),
    nextSevenDays: entries.filter((entry) => entry.nextSevenDays),
  };
}

export function filterManagerEntries(entries, { search = '', status = 'ALL', siteId = 'ALL', quick = 'ALL', locale = 'de-DE' } = {}) {
  const query = search.trim().toLocaleLowerCase(locale);
  return entries.filter((entry) => {
    const { request, room, site } = entry;
    const text = [request.id, request.details?.title, request.requesterAttribution?.displayName, room?.name, site?.name]
      .filter(Boolean).join(' ').toLocaleLowerCase(locale);
    const matchesQuick = quick === 'ALL' || ({
      ACTION: entry.action, TODAY: entry.today, NEXT_SEVEN: entry.nextSevenDays, UPCOMING: entry.upcoming,
    })[quick] === true;
    return (status === 'ALL' || (status === 'OPEN' ? entry.open : request.status === status))
      && (siteId === 'ALL' || site?.id === siteId)
      && matchesQuick && (!query || text.includes(query));
  });
}

export function serverReportRange(period, referenceDate, timeZone) {
  if (!['DAY', 'MONTH', 'QUARTER', 'YEAR'].includes(period)
    || !productionUtcInstant(referenceDate, '12:00', timeZone)) {
    throw new TypeError('MANAGER_REPORT_PERIOD_INVALID');
  }
  const [year, month] = referenceDate.split('-').map(Number);
  const iso = (y, m, d = 1) => new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10);
  let start = referenceDate;
  let end = shiftedDate(referenceDate, 1);
  if (period === 'MONTH') { start = iso(year, month); end = iso(year, month + 1); }
  if (period === 'QUARTER') {
    const firstMonth = Math.floor((month - 1) / 3) * 3 + 1;
    start = iso(year, firstMonth); end = iso(year, firstMonth + 3);
  }
  if (period === 'YEAR') { start = iso(year, 1); end = iso(year + 1, 1); }
  const fromInclusive = productionUtcInstant(start, '00:00', timeZone);
  const toExclusive = productionUtcInstant(end, '00:00', timeZone);
  if (!fromInclusive || !toExclusive) throw new TypeError('MANAGER_REPORT_PERIOD_INVALID');
  return Object.freeze({ fromInclusive, toExclusive, start, end: shiftedDate(end, -1), timeZone });
}

export function serverReportModel({ requests, catalog, siteId, range }) {
  const from = Date.parse(range.fromInclusive);
  const to = Date.parse(range.toExclusive);
  const scoped = requests.filter((request) => (request.pricing?.room?.siteId
    || requestSite(request, catalog)?.id) === siteId
    && Date.parse(request.startsAt) >= from && Date.parse(request.startsAt) < to);
  const confirmed = scoped.filter((request) => request.status === 'Confirmed');
  const rooms = new Map();
  const services = new Map();
  const packages = new Map();
  const items = new Map();
  const add = (map, key, name, values) => {
    const row = map.get(key) || { name, bookings: 0, hours: 0, participants: 0, quantity: 0 };
    row.bookings += 1;
    Object.entries(values).forEach(([field, value]) => { row[field] += value; });
    map.set(key, row);
  };
  let cateringBookings = 0;
  for (const request of confirmed) {
    const participants = request.internalParticipants + request.externalParticipants;
    const hours = (Date.parse(request.endsAt) - Date.parse(request.startsAt)) / 3_600_000;
    const room = request.pricing?.room || catalog.rooms.find((entry) => entry.id === request.roomId);
    add(rooms, request.roomId, room?.name, { participants, hours });
    for (const id of request.details?.serviceIds || []) {
      const service = request.pricing?.services?.find((entry) => entry.service.id === id)?.service
        || catalog.services.find((entry) => entry.id === id);
      add(services, id, service?.name, {});
    }
    const catering = request.details?.catering;
    const selectedPackage = catering?.packageSelection;
    if (selectedPackage) {
      const snapshot = request.pricing?.catering?.packageSelection;
      const name = snapshot?.package?.name || catalog.cateringPackages.find((entry) => entry.id === selectedPackage.packageId)?.name;
      const variant = snapshot?.variant?.name;
      add(packages, `${selectedPackage.packageId}:${selectedPackage.variantId}`, [name, variant].filter(Boolean).join(' · '), {
        participants: catering.participantCount,
      });
    }
    const quantities = catering?.itemQuantities?.filter((entry) => entry.quantity > 0) || [];
    for (const entry of quantities) {
      const item = request.pricing?.catering?.items?.find((value) => value.item.id === entry.itemId)?.item
        || catalog.cateringItems.find((value) => value.id === entry.itemId);
      add(items, entry.itemId, item?.name, { quantity: entry.quantity });
    }
    if (selectedPackage || quantities.length) cateringBookings += 1;
  }
  const ordered = (map) => [...map.values()].sort((a, b) => b.bookings - a.bookings);
  return {
    scoped, confirmed, roomRows: ordered(rooms), serviceRows: ordered(services),
    packageRows: ordered(packages), itemRows: ordered(items),
    openCount: scoped.filter((request) => OPEN.has(request.status)).length,
    participants: confirmed.reduce((sum, request) => sum + request.internalParticipants + request.externalParticipants, 0),
    hours: [...rooms.values()].reduce((sum, room) => sum + room.hours, 0),
    cateringBookings,
  };
}
