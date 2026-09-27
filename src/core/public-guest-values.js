const FEATURES = new Set(['step_free_entry', 'lift', 'accessible_toilet', 'hearing_loop']);
const AVAILABLE = new Set(['available', 'not_available']);
const ARRIVAL = new Set(['not_available', 'reception', 'organizer']);

function exact(value, keys, code) {
  if (value === null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Reflect.ownKeys(value).length !== keys.length
    || Reflect.ownKeys(value).some((key) => !keys.includes(key))) throw new TypeError(code);
  return value;
}

function features(values, code) {
  if (!Array.isArray(values) || values.length > FEATURES.size
    || values.some((value) => !FEATURES.has(value))
    || new Set(values).size !== values.length) throw new TypeError(code);
  return Object.freeze([...values].sort());
}

export function publicSiteGuestValues(value, code = 'PUBLIC_GUEST_VALUES_INVALID') {
  const item = exact(value, ['publicTransport', 'parking', 'arrival', 'accessibilityFeatures'], code);
  if (item === null) return null;
  if (!AVAILABLE.has(item.publicTransport) || !AVAILABLE.has(item.parking)
    || !ARRIVAL.has(item.arrival)) throw new TypeError(code);
  return Object.freeze({
    publicTransport: item.publicTransport,
    parking: item.parking,
    arrival: item.arrival,
    accessibilityFeatures: features(item.accessibilityFeatures, code),
  });
}

export function publicRoomGuestValues(value, code = 'PUBLIC_GUEST_VALUES_INVALID') {
  const item = exact(value, ['floorNumber', 'accessibilityFeatures'], code);
  if (item === null) return null;
  if (item.floorNumber !== null && (!Number.isSafeInteger(item.floorNumber)
    || item.floorNumber < -10 || item.floorNumber > 200)) throw new TypeError(code);
  return Object.freeze({
    floorNumber: item.floorNumber,
    accessibilityFeatures: features(item.accessibilityFeatures, code),
  });
}
