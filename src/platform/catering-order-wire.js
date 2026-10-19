const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function orderMoney(value, maximum = Number.MAX_SAFE_INTEGER - 1) {
  orderRecord(value, ['amountMinor','currency']);
  if (!['CHF','EUR','GBP','USD'].includes(value.currency)) invalid();
  return Object.freeze({ amountMinor: orderInteger(value.amountMinor, 0, maximum), currency: value.currency });
}
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
function invalid() {
  throw Object.assign(new TypeError('CATERING_ORDER_RESPONSE_INVALID'), { code: 'CATERING_ORDER_RESPONSE_INVALID' });
}
export function orderRecord(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) invalid();
  const actual = Reflect.ownKeys(value);
  if (actual.length !== keys.length || actual.some((key) => {
    const property = Object.getOwnPropertyDescriptor(value, key);
    return !keys.includes(key) || !property.enumerable || !Object.hasOwn(property, 'value');
  })) invalid();
}
export function orderArray(value, maximum) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > maximum
    || Reflect.ownKeys(value).length !== value.length + 1) invalid();
  for (let index = 0; index < value.length; index++) {
    const property = Object.getOwnPropertyDescriptor(value, String(index));
    if (!property || !property.enumerable || !Object.hasOwn(property, 'value')) invalid();
  }
  return value;
}
function text(value, maximum, nullable = false) {
  if (nullable && value === null) return null;
  if (typeof value !== 'string' || value.length < 1 || value.length > maximum || /[\u0000-\u001f\u007f]/.test(value)) invalid();
  return value;
}
function identifier(value) { if (typeof value !== 'string' || !ID.test(value)) invalid(); return value; }
export function orderUuid(value) { if (typeof value !== 'string' || !UUID.test(value)) invalid(); return value.toLowerCase(); }
export function orderInteger(value, minimum, maximum = Number.MAX_SAFE_INTEGER - 1) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) invalid();
  return value;
}
export function orderInstant(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
    || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) invalid();
  return value;
}
function price(value) { return orderMoney(value, 1000000000); }
function samePrice(left, right) { return left.amountMinor === right.amountMinor && left.currency === right.currency; }
function entry(value) {
  orderRecord(value, ['id','name','description','price']);
  return Object.freeze({ id: identifier(value.id), name: text(value.name, 160),
    description: text(value.description, 1000, true), price: price(value.price) });
}
function packageDetails(value) {
  orderRecord(value, ['variant','includedItems','includedSelections']);
  const includedItems = orderArray(value.includedItems, 300).map(entry);
  const ids = new Set(includedItems.map((item) => item.id));
  if (ids.size !== includedItems.length) invalid();
  const includedSelections = orderArray(value.includedSelections, 100).map((selection) => {
    orderRecord(selection, ['itemId','quantity']);
    const itemId = identifier(selection.itemId);
    if (!ids.has(itemId)) invalid();
    return Object.freeze({ itemId, quantity: orderInteger(selection.quantity, 1, 1000) });
  });
  if (new Set(includedSelections.map((selection) => selection.itemId)).size !== includedSelections.length) invalid();
  return Object.freeze({ variant: entry(value.variant), includedItems: Object.freeze(includedItems),
    includedSelections: Object.freeze(includedSelections) });
}
function position(value) {
  orderRecord(value, ['positionId','kind','entryId','name','description','quantity','unitPrice','conferenceLineTotalMinor','packageDetails']);
  if (!['item','package'].includes(value.kind)) invalid();
  const unitPrice = price(value.unitPrice);
  const quantity = orderInteger(value.quantity, 1, value.kind === 'package' ? 500 : 1000);
  const lineTotal = orderInteger(value.conferenceLineTotalMinor, 0);
  if (lineTotal !== unitPrice.amountMinor * quantity) invalid();
  const details = value.kind === 'package' ? packageDetails(value.packageDetails) : null;
  if ((details === null && value.packageDetails !== null) || (details && !samePrice(details.variant.price, unitPrice))) invalid();
  return Object.freeze({ positionId: orderUuid(value.positionId), kind: value.kind, entryId: identifier(value.entryId),
    name: text(value.name, 160), description: text(value.description, 1000, true), quantity, unitPrice,
    conferenceLineTotalMinor: lineTotal, packageDetails: details });
}

// Browser wire validation only: authoritative history, ownership and release remain server decisions.
export function cateringOrderSnapshot(value, expectedOrderId) {
  orderRecord(value, ['schemaVersion','integrationId','orderId','orderVersion','requestId','requestVersion',
    'assignmentRevision','catalogueRevision','sourceCapturedAt','startsAt','endsAt','room','title','participantCount',
    'dietaryRequirements','specialRequirements','positions','conferencePrice','providerCost']);
  const orderId = orderUuid(value.orderId);
  if (value.schemaVersion !== 1 || orderId !== orderUuid(expectedOrderId)
    || value.providerCost !== null) invalid();
  orderRecord(value.room, ['id','siteId','name']);
  const positions = orderArray(value.positions, 101).map(position);
  if (positions.length === 0 || new Set(positions.map((line) => line.positionId)).size !== positions.length
    || positions.some((line) => line.positionId === orderId)
    || new Set(positions.map((line) => `${line.kind}:${line.entryId}`)).size !== positions.length) invalid();
  const packages = positions.filter((line) => line.kind === 'package');
  const items = positions.filter((line) => line.kind === 'item');
  if (packages.length > 1 || items.length > 100) invalid();
  if (packages.length && packages[0].quantity !== value.participantCount) invalid();
  if (packages.length && items.some((line) => packages[0].packageDetails.includedItems.some((item) => item.id === line.entryId))) invalid();
  orderRecord(value.conferencePrice, ['amountMinor','currency']);
  const conferencePrice = orderMoney(value.conferencePrice);
  if (positions.reduce((sum, line) => sum + line.conferenceLineTotalMinor, 0) !== conferencePrice.amountMinor
    || positions.some((line) => line.conferenceLineTotalMinor > 0 && line.unitPrice.currency !== conferencePrice.currency)) invalid();
  const startsAt = orderInstant(value.startsAt);
  const endsAt = orderInstant(value.endsAt);
  if (Date.parse(endsAt) <= Date.parse(startsAt) || Date.parse(endsAt) - Date.parse(startsAt) > 86400000) invalid();
  return Object.freeze({ schemaVersion: 1, integrationId: orderUuid(value.integrationId), orderId,
    orderVersion: orderInteger(value.orderVersion, 1), requestId: identifier(value.requestId), requestVersion: orderInteger(value.requestVersion, 1),
    assignmentRevision: orderInteger(value.assignmentRevision, 1), catalogueRevision: orderInteger(value.catalogueRevision, 1),
    sourceCapturedAt: orderInstant(value.sourceCapturedAt), startsAt, endsAt,
    room: Object.freeze({ id: identifier(value.room.id), siteId: identifier(value.room.siteId), name: text(value.room.name, 160) }),
    title: text(value.title, 2000), participantCount: orderInteger(value.participantCount, 0, 500),
    dietaryRequirements: text(value.dietaryRequirements, 2000, true), specialRequirements: text(value.specialRequirements, 2000, true),
    positions: Object.freeze(positions), conferencePrice, providerCost: null });
}
