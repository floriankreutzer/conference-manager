import { formatNumber, t } from '../core/i18n.js';
import { el, field } from '../core/ui.js';
import { namedSelectionField } from '../shared/named-selection-field.js';
import { createRoomMediaModel } from './room-media-model.js';

export function createRoomMediaEditor({ room, index, catalogueMedia, demoRuntime }) {
  const model = createRoomMediaModel({ room, catalogueMedia, demoRuntime });
  const controls = {
    floorplanAssetId: el('select'),
    mediaAssetIds: el('select', { attrs: { multiple: true, size: '4' } }),
  };
  const previews = el('div', { className: 'room-media-grid', dataset: { managerRoomMediaPreviews: room.id } });
  const referenceList = el('dl', { className: 'details-list' });
  const previewById = new Map();
  function label(entry) {
    const name = t(`managerSettings.room.mediaChoice.${entry.kind}`, { room: room.name, number: formatNumber(entry.number) });
    return entry.url ? name : t('managerSettings.room.mediaChoiceUnavailable', { name });
  }
  function readValue() {
    return model.readValue({ floorplanAssetId: controls.floorplanAssetId.value || null,
      mediaAssetIds: Array.from(controls.mediaAssetIds.selectedOptions, (option) => option.value) });
  }
  function updateOptions(selection) {
    controls.floorplanAssetId.replaceChildren(el('option', { value: '', text: t('managerSettings.room.mediaNone') }),
      ...model.choices('floorplan').map((entry) => el('option', { value: entry.id, text: label(entry) })));
    controls.floorplanAssetId.value = selection.floorplanAssetId || '';
    controls.mediaAssetIds.replaceChildren(...model.choices('media').map((entry) => {
      const option = el('option', { value: entry.id, text: label(entry) });
      option.selected = selection.mediaAssetIds.includes(entry.id);
      return option;
    }));
  }
  function preview(entry) {
    if (previewById.has(entry.id)) return previewById.get(entry.id);
    const title = label(entry);
    const status = el('p', { className: 'room-asset-note', attrs: { role: 'status', 'aria-live': 'polite' },
      text: t(entry.url ? 'managerSettings.room.mediaLoading' : 'managerSettings.room.mediaUnavailable') });
    const node = el('figure', { className: 'manager-room-media-preview' }, [el('figcaption', { text: title }), status]);
    if (entry.url) {
      const image = el('img', { className: 'room-asset-visual media', attrs: {
        alt: entry.altText || title, loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer',
      } });
      image.addEventListener('load', () => { status.hidden = true; });
      image.addEventListener('error', () => {
        image.hidden = true;
        status.hidden = false;
        status.textContent = t('managerSettings.room.mediaUnavailable');
      });
      // Only the model's fixed same-origin paths may become image sources.
      image.setAttribute('src', entry.url);
      node.appendChild(image);
    }
    previewById.set(entry.id, node);
    return node;
  }
  function updatePreviews() {
    const selection = readValue();
    const selected = [
      ...model.choices('floorplan').filter((entry) => entry.id === selection.floorplanAssetId),
      ...model.choices('media').filter((entry) => selection.mediaAssetIds.includes(entry.id)),
    ];
    const entries = selected.filter((entry, index) => selected.findIndex((candidate) => candidate.id === entry.id) === index);
    previews.replaceChildren(...(entries.length ? entries.map(preview)
      : [el('p', { className: 'room-asset-empty', text: t('managerSettings.room.mediaEmpty') })]));
    referenceList.replaceChildren(...entries.flatMap((entry) => [
      el('dt', { text: label(entry) }), el('dd', { text: entry.id }),
    ]));
  }
  updateOptions({ floorplanAssetId: room.floorplanAssetId, mediaAssetIds: room.mediaAssetIds });
  const headingId = `manager-room-media-heading-${index}`;
  const node = el('section', { className: 'room-asset-panel', attrs: { 'aria-labelledby': headingId } }, [
    el('h3', { id: headingId, text: t('managerSettings.room.mediaHeading') }),
    el('p', { className: 'field-hint', text: t('managerSettings.help.roomMedia.details') }),
    el('div', { className: 'room-media-grid manager-room-media-controls' }, [
      field({ id: `manager-room-floorplan-${index}`, label: t('managerSettings.room.floorplanAssetId'),
        control: controls.floorplanAssetId, optional: true }),
      namedSelectionField({ id: `manager-room-media-${index}`, label: t('managerSettings.room.mediaAssetIds'),
        control: controls.mediaAssetIds, optional: true, hint: t('managerSettings.room.mediaSelectionHint') }),
    ]),
    ...(catalogueMedia === null ? [el('p', { className: 'room-asset-note', attrs: { role: 'status' },
      text: t('managerSettings.room.mediaMetadataUnavailable') })] : []),
    previews,
    el('details', {}, [el('summary', { text: t('managerSettings.catalogue.technicalDetails') }), referenceList]),
  ]);
  controls.floorplanAssetId.addEventListener('change', updatePreviews);
  controls.mediaAssetIds.addEventListener('change', updatePreviews);
  updatePreviews();
  return Object.freeze({ node, controls, readValue,
    addUploadedAsset({ kind, assetId }) {
      const selection = readValue();
      if (kind === 'media' && !selection.mediaAssetIds.includes(assetId) && selection.mediaAssetIds.length >= 20) {
        throw new RangeError('MANAGER_ROOM_MEDIA_LIMIT_REACHED');
      }
      model.addUploadedAsset({ kind, assetId });
      if (kind === 'floorplan') selection.floorplanAssetId = assetId;
      else if (!selection.mediaAssetIds.includes(assetId)) selection.mediaAssetIds.push(assetId);
      updateOptions(selection);
      controls.mediaAssetIds.dispatchEvent(new Event('change', { bubbles: true }));
      if (kind === 'floorplan') controls.floorplanAssetId.dispatchEvent(new Event('change', { bubbles: true }));
    },
  });
}
