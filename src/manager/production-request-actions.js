const NO_ACTIONS = Object.freeze([]);

const ACTIONS_BY_STATUS = Object.freeze({
  Submitted: Object.freeze(['start_review', 'reject', 'request_change', 'cancel']),
  'In Review': Object.freeze(['confirm', 'reject', 'request_change', 'cancel']),
  Confirmed: Object.freeze(['cancel']),
  'Change Requested': Object.freeze(['cancel']),
});

export function managerRequestActions(status) {
  return ACTIONS_BY_STATUS[status] || NO_ACTIONS;
}

export function managerCanProposeBookingChange(status, bookingChange) {
  return status === 'Confirmed' && bookingChange === null;
}
