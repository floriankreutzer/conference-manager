export const DURATION_FACTORS = Object.freeze({ minutes: 1, hours: 60, days: 1440 });

export function durationMinutes(value, unit, minimum, maximum) {
  if (typeof value !== 'string' || !value.trim() || !Object.hasOwn(DURATION_FACTORS, unit)) {
    throw new TypeError('POLICY_DURATION_INVALID');
  }
  const minutes = Number(value) * DURATION_FACTORS[unit];
  const rounded = Math.round(minutes);
  // Only absorb floating-point representation error during a unit round trip.
  const tolerance = Number.EPSILON * Math.max(1, Math.abs(minutes)) * 4;
  if (!Number.isSafeInteger(rounded) || Math.abs(minutes - rounded) > tolerance
    || rounded < minimum || rounded > maximum) throw new TypeError('POLICY_DURATION_INVALID');
  return rounded;
}

export function initialDurationUnit(minutes) {
  if (minutes > 0 && minutes % DURATION_FACTORS.days === 0) return 'days';
  if (minutes > 0 && minutes % DURATION_FACTORS.hours === 0) return 'hours';
  return 'minutes';
}
