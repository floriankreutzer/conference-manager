import { t } from '../core/i18n.js';
import { button, el, openDialog } from '../core/ui.js';
import {
  catalogData,
  generatedFloorplan,
  localized,
  safeImageSource,
} from './parity-data.js';

function createImage(src, alt, className) {
  return el('img', {
    className,
    attrs: {
      src,
      alt,
      loading: 'lazy',
      decoding: 'async',
      referrerpolicy: 'no-referrer',
    },
  });
}

export function requestIdFromCard(card) {
  return card instanceof HTMLElement ? card.dataset.requestId || null : null;
}

function roomForCard(card, catalog) {
  const roomId = card?.dataset.roomId;
  return roomId ? (catalog.rooms || []).find((room) => room.id === roomId) || null : null;
}

function packageForCard(card, catalog) {
  const packageId = card?.dataset.packageId;
  const tier = card?.dataset.packageTier;
  if (!packageId || !tier) return null;
  const pack = (catalog.cateringPackages || []).find((entry) => entry.id === packageId);
  const variant = pack?.variants?.find((entry) => entry.tier === tier);
  return pack && variant ? { pack, variant } : null;
}

function decorateCateringCards() {
  const catalog = catalogData();
  document.querySelectorAll('.package-grid .option-card').forEach((card) => {
    if (card.querySelector('.catering-card-image')) return;
    const match = packageForCard(card, catalog);
    if (!match) return;
    const src = safeImageSource(match.variant.image);
    if (!src) return;
    card.prepend(createImage(
      src,
      t('catering.imageAlt', {
        name: localized(match.pack.name),
        tier: match.variant.tier,
      }),
      'catering-card-image',
    ));
  });
}

function decorateRoomCards() {
  const catalog = catalogData();
  document.querySelectorAll('#rooms .option-card').forEach((card) => {
    const room = roomForCard(card, catalog);
    if (!room) return;

    const floorplanButton = card.querySelector('button[data-room-action="floorplan"]');
    if (floorplanButton instanceof HTMLButtonElement) floorplanButton.dataset.featureFloorplan = room.id;

    if (card.querySelector('.room-preview')) return;

    const preview = el('section', { className: 'room-preview' });
    preview.append(
      createImage(
        safeImageSource(room.floorplanImage, generatedFloorplan(room)),
        t('room.floorplan.previewAlt', { name: localized(room.name) }),
        'room-preview-image',
      ),
      el('div', { className: 'room-preview-copy' }, [
        el('strong', { text: localized(room.floor) || t('room.floor') }),
        el('p', { text: localized(room.floorplanDescription) }),
      ]),
    );

    const actions = card.querySelector('.button-row');
    if (actions) card.insertBefore(preview, actions);
    else card.appendChild(preview);
  });
}

function decoratePdfButtons() {
  document.querySelectorAll('.request-card').forEach((card) => {
    const requestId = requestIdFromCard(card);
    if (!requestId) return;
    const control = card.querySelector('button[data-request-action="print"]');
    if (control instanceof HTMLButtonElement) control.dataset.featurePdf = requestId;
  });
}

export function openRichFloorplan(roomId) {
  const catalog = catalogData();
  const room = (catalog.rooms || []).find((entry) => entry.id === roomId);
  if (!room) return;

  const content = el('section', { className: 'rich-floorplan' });
  content.appendChild(createImage(
    safeImageSource(room.floorplanImage, generatedFloorplan(room)),
    t('room.floorplan.previewAlt', { name: localized(room.name) }),
    'rich-floorplan-image',
  ));

  const copy = el('section', { className: 'rich-floorplan-copy' }, [
    el('h3', { text: t('room.floorplan.impression') }),
    el('p', { text: localized(room.floorplanDescription) }),
    el('h3', { text: t('room.floorplan.important') }),
  ]);
  const details = el('dl', { className: 'details-list' });
  [
    [t('room.floor'), localized(room.floor)],
    [t('manager.capacity'), String(room.capacity || 0)],
    [t('manager.equipment'), localized(room.equipment)],
    [t('schedule.location'), room.location || '—'],
  ].forEach(([label, value]) => {
    details.append(el('dt', { text: label }), el('dd', { text: value || '—' }));
  });
  copy.appendChild(details);
  content.appendChild(copy);

  const close = button(t('common.close'), { className: 'primary' });
  const dialog = openDialog({
    title: localized(room.name),
    content,
    actions: [close],
    labelledById: 'featureFloorplanTitle',
  });
  close.addEventListener('click', () => dialog.close());
}

export function decorateEmployeeParity() {
  decorateCateringCards();
  decorateRoomCards();
  decoratePdfButtons();
}
