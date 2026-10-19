import { normalizeCateringOrderView } from '../platform/catering-order-api.js';
import { spreadsheetSafeCsvCell } from '../shared/spreadsheet-csv-cell.js';

const MAX_CSV_BYTES = 2_097_152;
const HEADERS = ['record_kind','order_id','order_version','integration_id','operation','order_status','generated_at_utc',
  'conference_title','room_name','starts_at_utc','ends_at_utc','participants','dietary_requirements','special_requirements',
  'position_id','position_kind','position_name','description','quantity','package_variant','components_json','selections_json',
  'quoted_supplier_total_minor','currency','cost_approved','quote_revision','quote_expires_at_utc','notice'];

export function requireCurrentCateringDocumentSource(displayed, current, orderId) {
  const original = normalizeCateringOrderView(displayed, orderId);
  const loaded = normalizeCateringOrderView(current, orderId);
  if (JSON.stringify(original) !== JSON.stringify(loaded)) {
    throw Object.assign(new Error('CATERING_DOCUMENT_SOURCE_CHANGED'), { code: 'CATERING_DOCUMENT_SOURCE_CHANGED' });
  }
  return loaded;
}

export function createCateringOrderDocument(view, { orderId, generatedAt = new Date() } = {}) {
  const current = normalizeCateringOrderView(view, orderId);
  if (!(generatedAt instanceof Date) || !Number.isFinite(generatedAt.getTime())) throw new TypeError('CATERING_DOCUMENT_TIME_INVALID');
  const source = current.order;
  const positions = source.positions.map((position) => Object.freeze({ positionId: position.positionId, kind: position.kind,
    name: position.name, description: position.description, quantity: position.quantity,
    variant: position.packageDetails?.variant.name ?? null,
    components: Object.freeze((position.packageDetails?.includedItems ?? []).map((entry) => Object.freeze({
      id: entry.id, name: entry.name, description: entry.description,
    }))), selections: Object.freeze((position.packageDetails?.includedSelections ?? []).map((entry) => Object.freeze({ ...entry }))),
  }));
  // Supplier documents do not disclose Conference Manager selling prices,
  // initiator/session data, allocations, audit actors, credentials or provider URLs.
  return Object.freeze({ schemaVersion: 1, orderId: source.orderId, orderVersion: source.orderVersion,
    integrationId: source.integrationId, operation: current.operation, status: current.state.status,
    generatedAt: generatedAt.toISOString(), title: source.title, room: source.room.name,
    startsAt: source.startsAt, endsAt: source.endsAt, participantCount: source.participantCount,
    dietaryRequirements: source.dietaryRequirements, specialRequirements: source.specialRequirements,
    positions: Object.freeze(positions), quote: current.quote === null ? null : Object.freeze({ revision: current.quote.revision,
      cost: current.quote.cost, expiresAt: current.quote.expiresAt, expired: current.quote.expired,
      approved: current.decision?.decision === 'approved' }),
  });
}

// Stable machine headers and UTC/integer fields; UI/localized document copy is
// supplied separately. The total occurs once, never once per commercial position.
export function cateringOrderDocumentCsv(view, { orderId, generatedAt, notice } = {}) {
  if (typeof notice !== 'string' || notice.length < 1 || notice.length > 1000 || /[\u0000-\u001f\u007f]/u.test(notice)) {
    throw new TypeError('CATERING_DOCUMENT_NOTICE_INVALID');
  }
  const document = createCateringOrderDocument(view, { orderId, generatedAt });
  const identity = { order_id: document.orderId, order_version: document.orderVersion, integration_id: document.integrationId };
  const rows = [{ ...identity, record_kind: 'summary', operation: document.operation, order_status: document.status,
    generated_at_utc: document.generatedAt, conference_title: document.title, room_name: document.room,
    starts_at_utc: document.startsAt, ends_at_utc: document.endsAt, participants: document.participantCount,
    dietary_requirements: document.dietaryRequirements, special_requirements: document.specialRequirements,
    quoted_supplier_total_minor: document.quote?.cost.amountMinor, currency: document.quote?.cost.currency,
    cost_approved: document.quote?.approved ?? false, quote_revision: document.quote?.revision,
    quote_expires_at_utc: document.quote?.expiresAt, notice },
  ...document.positions.map((position) => ({ ...identity, record_kind: 'position', position_id: position.positionId,
    position_kind: position.kind, position_name: position.name, description: position.description, quantity: position.quantity,
    package_variant: position.variant, components_json: JSON.stringify(position.components),
    selections_json: JSON.stringify(position.selections) }))];
  const csv = `${[HEADERS.map(spreadsheetSafeCsvCell).join(','),
    ...rows.map((row) => HEADERS.map((header) => spreadsheetSafeCsvCell(row[header])).join(','))].join('\r\n')}\r\n`;
  if (new TextEncoder().encode(csv).byteLength > MAX_CSV_BYTES) throw new TypeError('CATERING_DOCUMENT_CSV_LIMIT');
  return csv;
}
