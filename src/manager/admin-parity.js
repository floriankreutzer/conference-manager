import { t } from '../core/i18n.js';
import { button, clear, el, field, showToast } from '../core/ui.js';
import { pt } from './parity-i18n.js';
import {
  catalogData,
  DEMO_IMAGE_SOURCE_MAX_LENGTH,
  localized,
  setLocalized,
  siteData,
  validatedHttps,
  validatedImageSource,
  writeCatalog,
  writeSites,
} from './parity-data.js';

export const PARITY_RETURN_KEY = 'conference_feature_parity_return_v1';

let adminSection = 'ROOMS';

export function setAdminSection(value) {
  adminSection = value || 'ROOMS';
}

export function getAdminSection() {
  return adminSection;
}

function textInput(value, type = 'text') {
  return el('input', { type, value: value ?? '' });
}

function imageInput(value) {
  const control = textInput(value);
  control.maxLength = DEMO_IMAGE_SOURCE_MAX_LENGTH;
  control.addEventListener('input', () => control.removeAttribute('aria-invalid'));
  return control;
}

function imageSourceOrReport(control) {
  const source = validatedImageSource(control.value);
  if (source !== null) return source;
  control.setAttribute('aria-invalid', 'true');
  showToast(pt('parity.admin.invalidImage'));
  control.focus();
  return null;
}

function numberInput(value, min = 0, step = '1') {
  const control = el('input', { type: 'number', value: value ?? '' });
  control.min = String(min);
  control.step = String(step);
  return control;
}

function checkboxInput(value) {
  const control = el('input', { type: 'checkbox' });
  control.checked = Boolean(value);
  return control;
}

function saveAndReload({ catalog = null, sites = null, section = adminSection }) {
  if (catalog) writeCatalog(catalog);
  if (sites) writeSites(sites);
  sessionStorage.setItem(PARITY_RETURN_KEY, JSON.stringify({
    managerTab: 'ADMIN',
    adminSection: section,
  }));
  showToast(pt('parity.admin.saveReload'));
  setTimeout(() => window.location.reload(), 80);
}

function adminActions(saveHandler, deleteHandler = null) {
  const actions = el('footer', { className: 'admin-actions' });
  const save = button(t('common.save'), { className: 'primary' });
  save.addEventListener('click', saveHandler);
  actions.appendChild(save);

  if (deleteHandler) {
    const remove = button(t('common.delete'), { className: 'danger' });
    remove.addEventListener('click', deleteHandler);
    actions.appendChild(remove);
  }
  return actions;
}

function adminSummary(catalog, sites) {
  const summary = el('section', { className: 'admin-summary' });
  [
    [pt('parity.admin.activeRooms'), (catalog.rooms || []).filter((room) => room.active !== false).length],
    [pt('parity.admin.locations'), Object.keys(sites).length],
    [pt('parity.admin.activeServices'), (catalog.services || []).filter((service) => service.active !== false).length],
    [pt('parity.admin.packageCount'), (catalog.cateringPackages || []).length],
  ].forEach(([label, value]) => {
    summary.appendChild(el('article', {}, [
      el('small', { text: label }),
      el('strong', { text: String(value) }),
    ]));
  });
  return summary;
}

function renderRooms(root) {
  const catalog = catalogData();
  (catalog.rooms || []).forEach((room) => {
    const card = el('article', { className: 'admin-card parity-admin-card' }, [
      el('h3', { text: localized(room.name) || room.id }),
    ]);

    const name = textInput(localized(room.name));
    const location = textInput(room.location || '');
    const capacity = numberInput(room.capacity, 1);
    const rate = numberInput(room.rate, 0, '0.01');
    const equipment = textInput(localized(room.equipment));
    const floor = textInput(localized(room.floor));
    const description = el('textarea');
    description.value = localized(room.floorplanDescription);
    const image = imageInput(room.floorplanImage || '');
    const active = checkboxInput(room.active !== false);

    card.append(
      field({ id: `room-name-${room.id}`, label: pt('parity.admin.name'), control: name }),
      field({ id: `room-location-${room.id}`, label: pt('parity.admin.location'), control: location }),
      field({ id: `room-cap-${room.id}`, label: pt('parity.admin.capacity'), control: capacity }),
      field({ id: `room-price-${room.id}`, label: pt('parity.admin.price'), control: rate }),
      field({ id: `room-equipment-${room.id}`, label: pt('parity.admin.equipment'), control: equipment }),
      field({ id: `room-floor-${room.id}`, label: pt('parity.admin.floor'), control: floor }),
      field({
        id: `room-floorplan-description-${room.id}`,
        label: pt('parity.admin.floorplanDescription'),
        control: description,
      }),
      field({
        id: `room-floorplan-image-${room.id}`,
        label: pt('parity.admin.floorplanImage'),
        control: image,
      }),
      field({ id: `room-active-${room.id}`, label: pt('parity.admin.active'), control: active }),
    );

    card.appendChild(adminActions(() => {
      const imageSource = imageSourceOrReport(image);
      if (imageSource === null) return;

      const latest = catalogData();
      const target = (latest.rooms || []).find((entry) => entry.id === room.id);
      if (!target) return;
      target.name = setLocalized(target.name, name.value.trim());
      target.location = location.value.trim();
      target.capacity = Math.max(1, Number(capacity.value || 1));
      target.rate = Math.max(0, Number(rate.value || 0));
      target.equipment = setLocalized(target.equipment, equipment.value.trim());
      target.floor = setLocalized(target.floor, floor.value.trim());
      target.floorplanDescription = setLocalized(
        target.floorplanDescription,
        description.value.trim(),
      );
      target.floorplanImage = imageSource;
      target.active = active.checked;
      saveAndReload({ catalog: latest, section: 'ROOMS' });
    }, () => {
      const latest = catalogData();
      latest.rooms = (latest.rooms || []).filter((entry) => entry.id !== room.id);
      saveAndReload({ catalog: latest, section: 'ROOMS' });
    }));

    root.appendChild(card);
  });

  const add = button(pt('parity.admin.addRoom'), { className: 'primary' });
  add.addEventListener('click', () => {
    const catalog = catalogData();
    const defaultLocation = Object.keys(siteData())[0] || 'Berlin';
    catalog.rooms.push({
      id: `ROOM-${Date.now()}`,
      location: defaultLocation,
      name: { de: '', en: '' },
      capacity: 8,
      equipment: { de: '', en: '' },
      floor: { de: '', en: '' },
      floorplanDescription: { de: '', en: '' },
      floorplanImage: '',
      rate: 0,
      active: true,
    });
    saveAndReload({ catalog, section: 'ROOMS' });
  });
  root.appendChild(add);
}

function renderServices(root) {
  const catalog = catalogData();
  (catalog.services || []).forEach((service) => {
    const card = el('article', { className: 'admin-card parity-admin-card' }, [
      el('h3', { text: localized(service.name) || service.id }),
    ]);
    const name = textInput(localized(service.name));
    const description = el('textarea');
    description.value = localized(service.description);
    const price = numberInput(service.price, 0, '0.01');
    const active = checkboxInput(service.active !== false);

    card.append(
      field({ id: `service-name-${service.id}`, label: pt('parity.admin.name'), control: name }),
      field({ id: `service-desc-${service.id}`, label: pt('parity.admin.description'), control: description }),
      field({ id: `service-price-${service.id}`, label: pt('parity.admin.price'), control: price }),
      field({ id: `service-active-${service.id}`, label: pt('parity.admin.active'), control: active }),
    );

    card.appendChild(adminActions(() => {
      const latest = catalogData();
      const target = (latest.services || []).find((entry) => entry.id === service.id);
      if (!target) return;
      target.name = setLocalized(target.name, name.value.trim());
      target.description = setLocalized(target.description, description.value.trim());
      target.price = Math.max(0, Number(price.value || 0));
      target.active = active.checked;
      saveAndReload({ catalog: latest, section: 'SERVICES' });
    }, () => {
      const latest = catalogData();
      latest.services = (latest.services || []).filter((entry) => entry.id !== service.id);
      saveAndReload({ catalog: latest, section: 'SERVICES' });
    }));

    root.appendChild(card);
  });

  const add = button(pt('parity.admin.addService'), { className: 'primary' });
  add.addEventListener('click', () => {
    const catalog = catalogData();
    catalog.services.push({
      id: `SERVICE-${Date.now()}`,
      name: { de: '', en: '' },
      description: { de: '', en: '' },
      price: 0,
      active: true,
    });
    saveAndReload({ catalog, section: 'SERVICES' });
  });
  root.appendChild(add);
}

function renderPackages(root) {
  const catalog = catalogData();
  (catalog.cateringPackages || []).forEach((pack) => {
    const card = el('article', { className: 'admin-card parity-admin-card catering-package-admin' }, [
      el('h3', { text: localized(pack.name) || pack.id }),
    ]);

    const name = textInput(localized(pack.name));
    const description = el('textarea');
    description.value = localized(pack.description);
    card.append(
      field({ id: `package-name-${pack.id}`, label: pt('parity.admin.name'), control: name }),
      field({ id: `package-description-${pack.id}`, label: pt('parity.admin.description'), control: description }),
    );

    const variants = [];
    (pack.variants || []).forEach((variant, index) => {
      const group = el('fieldset', { className: 'variant-admin' });
      group.appendChild(el('legend', { text: `${pt('parity.admin.tier')} · ${variant.tier}` }));

      const tier = textInput(variant.tier);
      const variantDescription = el('textarea');
      variantDescription.value = localized(variant.description);
      const price = numberInput(variant.pricePerPerson, 0, '0.01');
      const image = imageInput(variant.image || '');

      group.append(
        field({ id: `parity-package-tier-${pack.id}-${index}`, label: pt('parity.admin.tier'), control: tier }),
        field({ id: `parity-package-variant-desc-${pack.id}-${index}`, label: pt('parity.admin.description'), control: variantDescription }),
        field({ id: `parity-package-price-${pack.id}-${index}`, label: pt('parity.admin.price'), control: price }),
        field({ id: `parity-package-image-${pack.id}-${index}`, label: pt('parity.admin.image'), control: image }),
      );

      variants.push({ tier, description: variantDescription, price, image });
      card.appendChild(group);
    });

    card.appendChild(adminActions(() => {
      const imageSources = [];
      for (const variant of variants) {
        const source = imageSourceOrReport(variant.image);
        if (source === null) return;
        imageSources.push(source);
      }

      const latest = catalogData();
      const target = (latest.cateringPackages || []).find((entry) => entry.id === pack.id);
      if (!target) return;
      target.name = setLocalized(target.name, name.value.trim());
      target.description = setLocalized(target.description, description.value.trim());
      target.variants = target.variants.map((variant, index) => ({
        ...variant,
        tier: variants[index].tier.value.trim(),
        description: setLocalized(variant.description, variants[index].description.value.trim()),
        pricePerPerson: Math.max(0, Number(variants[index].price.value || 0)),
        image: imageSources[index],
      }));
      saveAndReload({ catalog: latest, section: 'PACKAGES' });
    }, () => {
      const latest = catalogData();
      latest.cateringPackages = (latest.cateringPackages || []).filter((entry) => entry.id !== pack.id);
      saveAndReload({ catalog: latest, section: 'PACKAGES' });
    }));

    root.appendChild(card);
  });

  const add = button(pt('parity.admin.addPackage'), { className: 'primary' });
  add.addEventListener('click', () => {
    const catalog = catalogData();
    catalog.cateringPackages.push({
      id: `PACKAGE-${Date.now()}`,
      name: { de: '', en: '' },
      description: { de: '', en: '' },
      variants: ['Basic', 'Standard', 'Deluxe'].map((tier) => ({
        tier,
        description: { de: '', en: '' },
        pricePerPerson: 0,
        image: '',
      })),
    });
    saveAndReload({ catalog, section: 'PACKAGES' });
  });
  root.appendChild(add);
}

function renderItems(root) {
  const catalog = catalogData();
  (catalog.cateringItems || []).forEach((item) => {
    const card = el('article', { className: 'admin-card parity-admin-card' }, [
      el('h3', { text: localized(item.name) || item.id }),
    ]);
    const name = textInput(localized(item.name));
    const unit = textInput(localized(item.unit));
    const price = numberInput(item.price, 0, '0.01');
    const active = checkboxInput(item.active !== false);

    card.append(
      field({ id: `item-name-${item.id}`, label: pt('parity.admin.name'), control: name }),
      field({ id: `item-unit-${item.id}`, label: pt('parity.admin.unit'), control: unit }),
      field({ id: `item-price-${item.id}`, label: pt('parity.admin.price'), control: price }),
      field({ id: `item-active-${item.id}`, label: pt('parity.admin.active'), control: active }),
    );

    card.appendChild(adminActions(() => {
      const latest = catalogData();
      const target = (latest.cateringItems || []).find((entry) => entry.id === item.id);
      if (!target) return;
      target.name = setLocalized(target.name, name.value.trim());
      target.unit = setLocalized(target.unit, unit.value.trim());
      target.price = Math.max(0, Number(price.value || 0));
      target.active = active.checked;
      saveAndReload({ catalog: latest, section: 'ITEMS' });
    }, () => {
      const latest = catalogData();
      latest.cateringItems = (latest.cateringItems || []).filter((entry) => entry.id !== item.id);
      saveAndReload({ catalog: latest, section: 'ITEMS' });
    }));

    root.appendChild(card);
  });

  const add = button(pt('parity.admin.addItem'), { className: 'primary' });
  add.addEventListener('click', () => {
    const catalog = catalogData();
    catalog.cateringItems.push({
      id: `ITEM-${Date.now()}`,
      name: { de: '', en: '' },
      unit: { de: '', en: '' },
      price: 0,
      active: true,
    });
    saveAndReload({ catalog, section: 'ITEMS' });
  });
  root.appendChild(add);
}

function renderSites(root) {
  const sites = siteData();
  Object.keys(sites).sort().forEach((location) => {
    const site = sites[location];
    const card = el('article', { className: 'admin-card parity-admin-card' }, [
      el('h3', { text: location }),
    ]);

    const definitions = [
      ['address', 'parity.admin.address', false],
      ['publicTransport', 'parity.admin.publicTransport', true],
      ['carArrival', 'parity.admin.carArrival', true],
      ['parking', 'parity.admin.parking', true],
      ['reception', 'parity.admin.reception', true],
      ['building', 'parity.admin.building', true],
      ['visitorNotes', 'parity.admin.visitorNotes', true],
      ['accessibility', 'parity.admin.accessibility', true],
      ['contact', 'parity.admin.contact', false],
      ['contactDetails', 'parity.admin.contactDetails', false],
      ['mapsUrl', 'parity.admin.mapsUrl', false],
      ['wifiName', 'parity.admin.wifiName', false],
      ['wifiPassword', 'parity.admin.wifiPassword', false],
      ['wifiInstructions', 'parity.admin.wifiInstructions', true],
    ];

    const controls = new Map();
    definitions.forEach(([key, labelKey]) => {
      const control = key === 'visitorNotes' || key === 'wifiInstructions'
        ? el('textarea')
        : textInput(localized(site[key]), key === 'mapsUrl' ? 'url' : 'text');
      if (control.tagName === 'TEXTAREA') control.value = localized(site[key]);
      controls.set(key, control);
      card.appendChild(field({ id: `parity-site-${location}-${key}`, label: pt(labelKey), control }));
    });

    card.appendChild(adminActions(() => {
      const mapUrlValue = controls.get('mapsUrl').value.trim();
      if (mapUrlValue && !validatedHttps(mapUrlValue)) {
        showToast(pt('parity.admin.invalidUrl'));
        controls.get('mapsUrl').focus();
        return;
      }

      const latest = siteData();
      const target = latest[location];
      if (!target) return;
      definitions.forEach(([key, _label, localizedField]) => {
        const value = controls.get(key).value.trim();
        target[key] = localizedField ? setLocalized(target[key], value) : value;
      });
      target.mapsUrl = mapUrlValue ? validatedHttps(mapUrlValue) : '';
      saveAndReload({ sites: latest, section: 'SITES' });
    }));

    root.appendChild(card);
  });
}

function renderEditor(root) {
  clear(root);
  if (adminSection === 'ROOMS') renderRooms(root);
  if (adminSection === 'SITES') renderSites(root);
  if (adminSection === 'SERVICES') renderServices(root);
  if (adminSection === 'PACKAGES') renderPackages(root);
  if (adminSection === 'ITEMS') renderItems(root);
}

export function enhanceAdmin(section) {
  if (section.dataset.featureParity === 'admin') return;
  section.dataset.featureParity = 'admin';
  clear(section);

  const catalog = catalogData();
  const sites = siteData();
  section.append(
    el('header', { className: 'section-heading' }, [
      el('div', {}, [
        el('h2', { text: t('manager.admin') }),
        el('p', { text: t('manager.adminDesc') }),
      ]),
    ]),
    adminSummary(catalog, sites),
  );

  const nav = el('nav', { className: 'admin-parity-nav', attrs: { 'aria-label': t('manager.admin') } });
  const resources = el('fieldset');
  resources.appendChild(el('legend', { text: pt('parity.admin.resources') }));
  const offers = el('fieldset');
  offers.appendChild(el('legend', { text: pt('parity.admin.offers') }));

  const editor = el('section', { className: 'admin-parity-editor', dataset: { featureAdminEditor: 'true' } });

  [
    ['ROOMS', pt('parity.admin.rooms'), resources],
    ['SITES', pt('parity.admin.sites'), resources],
    ['SERVICES', pt('parity.admin.services'), offers],
    ['PACKAGES', pt('parity.admin.packages'), offers],
    ['ITEMS', pt('parity.admin.items'), offers],
  ].forEach(([value, label, parent]) => {
    const control = button(label, { dataset: { adminSection: value }, attrs: { 'aria-pressed': String(adminSection === value) } });
    control.addEventListener('click', () => {
      adminSection = value;
      nav.querySelectorAll('[data-admin-section]').forEach((item) => {
        item.setAttribute('aria-pressed', String(item.dataset.adminSection === value));
      });
      renderEditor(editor);
    });
    parent.appendChild(control);
  });

  nav.append(resources, offers);
  section.append(nav, editor);
  renderEditor(editor);
}
