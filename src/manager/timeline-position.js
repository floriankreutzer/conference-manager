const TIMELINE_START_MINUTES = 6 * 60;
const TIMELINE_END_MINUTES = 22 * 60;
const TIMELINE_MINUTES = TIMELINE_END_MINUTES - TIMELINE_START_MINUTES;

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function timeToMinutes(value, fallback) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(value || ''));
  if (!match) return fallback;
  return (Number(match[1]) * 60) + Number(match[2]);
}

export function timelinePosition(start, end) {
  const startMinutes = clamp(
    timeToMinutes(start, TIMELINE_START_MINUTES),
    TIMELINE_START_MINUTES,
    TIMELINE_END_MINUTES - 1,
  );
  const endMinutes = clamp(
    timeToMinutes(end, startMinutes + 1),
    startMinutes + 1,
    TIMELINE_END_MINUTES,
  );
  const startPercent = clamp(
    Math.round(((startMinutes - TIMELINE_START_MINUTES) / TIMELINE_MINUTES) * 100),
    0,
    99,
  );
  const rawWidth = Math.round(((endMinutes - startMinutes) / TIMELINE_MINUTES) * 100);
  const widthPercent = clamp(Math.max(1, rawWidth), 1, 100 - startPercent);

  return Object.freeze({
    startPercent,
    widthPercent,
    startClass: `room-timeline-start-${startPercent}`,
    widthClass: `room-timeline-width-${widthPercent}`,
  });
}
