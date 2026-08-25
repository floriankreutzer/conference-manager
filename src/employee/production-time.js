export function productionUtcInstant(dateValue, timeValue) {
  if (typeof dateValue !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) return null;
  if (typeof timeValue !== 'string' || !/^\d{2}:\d{2}$/.test(timeValue)) return null;
  const local = new Date(`${dateValue}T${timeValue}:00`);
  if (!Number.isFinite(local.getTime())) return null;
  return local.toISOString();
}
