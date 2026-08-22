(function () {
  const SITE_KEY = 'conference_site_info_v1';
  const CATALOG_KEY = 'conference_catalog_v2';

  const qs = id => document.getElementById(id);
  const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));

  const defaults = {
    Berlin: emptySite('Berlin'),
    Stuttgart: emptySite('Stuttgart'),
    Frankfurt: emptySite('Frankfurt')
  };

  function emptySite(name) {
    return {
      name,
      address:'',
      publicTransport:'',
      carArrival:'',
      parking:'',
      reception:'',
      building:'',
      visitorNotes:'',
      accessibility:'',
      contact:'',
      contactDetails:'',
      mapsUrl:''
    };
  }

  function getCatalog() {
    try { return JSON.parse(localStorage.getItem(CATALOG_KEY) || 'null'); } catch { return null; }
  }

  function knownLocations() {
    const fromCatalog = getCatalog()?.rooms?.map(r => r.location).filter(Boolean) || [];
    return [...new Set([...Object.keys(defaults), ...fromCatalog])].sort();
  }

  function loadAll() {
    let data = {};
    try { data = JSON.parse(localStorage.getItem(SITE_KEY) || '{}') || {}; } catch { data = {}; }
    let changed = false;
    knownLocations().forEach(location => {
      if (!data[location]) { data[location] = emptySite(location); changed = true; }
      else {
        const merged = { ...emptySite(location), ...data[location], name: location };
        if (JSON.stringify(merged) !== JSON.stringify(data[location])) changed = true;
        data[location] = merged;
      }
    });
    if (changed) localStorage.setItem(SITE_KEY, JSON.stringify(data));
    return data;
  }

  function saveAll(data) {
    localStorage.setItem(SITE_KEY, JSON.stringify(data));
  }

  function getSite(location) {
    const data = loadAll();
    return data[location] || emptySite(location || 'Standort');
  }

  window.getConferenceSiteInfo = getSite;

  function injectStyles() {
    if (qs('siteInfoStyles')) return;
    const style = document.createElement('style');
    style.id = 'siteInfoStyles';
    style.textContent = `
      .site-editor{display:grid;gap:16px}
      .site-card{border:1px solid #d0d0ce;background:#fafafa;padding:18px}
      .site-card h3{margin:0 0 4px}
      .site-card .site-sub{margin:0 0 16px;color:#63666a}
      .site-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
      .site-fields .wide{grid-column:1/-1}
      .site-fields textarea{min-height:86px}
      .site-status{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
      .site-status span{font-size:12px;padding:5px 8px;background:#ededed;color:#53565a}
      .site-status span.ok{background:#eef7df;color:#046a38;border-left:3px solid #86bc25}
      @media(max-width:760px){.site-fields{grid-template-columns:1fr}.site-fields .wide{grid-column:auto}}
    `;
    document.head.appendChild(style);
  }

  function ensureTab() {
    const nav = document.querySelector('.catalog-nav');
    if (!nav || nav.querySelector('[data-catalog-tab="sites"]')) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'catalog-tab';
    btn.dataset.catalogTab = 'sites';
    btn.textContent = 'Standorte';
    nav.appendChild(btn);
  }

  function field(id, label, value, cls='') {
    return `<label class="${cls}"><span>${label}</span><input id="${id}" value="${esc(value)}"></label>`;
  }

  function textarea(id, label, value, cls='') {
    return `<label class="${cls}"><span>${label}</span><textarea id="${id}">${esc(value)}</textarea></label>`;
  }

  function completeness(site) {
    const required = ['address','publicTransport','carArrival','parking','reception','building','contact'];
    const filled = required.filter(k => String(site[k] || '').trim()).length;
    return { filled, total: required.length, complete: filled === required.length };
  }

  function renderEditor() {
    const editor = qs('catalogEditor');
    if (!editor) return;
    qsa('[data-catalog-tab]').forEach(b => b.classList.toggle('active', b.dataset.catalogTab === 'sites'));
    try { if (typeof state !== 'undefined') state.catalogTab = 'sites'; } catch (_) {}
    const data = loadAll();
    editor.innerHTML = `
      <div class="info-box">Diese Angaben werden automatisch in der Buchungsdetailansicht und im Willkommens-PDF für Teilnehmende verwendet.</div>
      <div class="site-editor">
        ${knownLocations().map(location => {
          const s = data[location];
          const c = completeness(s);
          return `<div class="site-card" data-site-card="${esc(location)}">
            <h3>${esc(location)}</h3>
            <p class="site-sub">Standortinformationen für interne und externe Gäste.</p>
            <div class="site-fields">
              ${field(`site-address-${slug(location)}`,'Adresse',s.address,'wide')}
              ${textarea(`site-public-${slug(location)}`,'ÖPNV-Anfahrt',s.publicTransport)}
              ${textarea(`site-car-${slug(location)}`,'PKW-Anfahrt',s.carArrival)}
              ${textarea(`site-parking-${slug(location)}`,'Parken',s.parking)}
              ${textarea(`site-reception-${slug(location)}`,'Empfang / Zutritt',s.reception)}
              ${textarea(`site-building-${slug(location)}`,'Im Gebäude / Weg zum Raum',s.building,'wide')}
              ${textarea(`site-visitor-${slug(location)}`,'Hinweise für Besucher',s.visitorNotes)}
              ${textarea(`site-access-${slug(location)}`,'Barrierefreiheit',s.accessibility)}
              ${field(`site-contact-${slug(location)}`,'Ansprechpartner / Funktion',s.contact)}
              ${field(`site-contactdetails-${slug(location)}`,'Kontakt (Telefon / E-Mail)',s.contactDetails)}
              ${field(`site-maps-${slug(location)}`,'Maps-/Routen-Link',s.mapsUrl,'wide')}
            </div>
            <div class="site-status"><span class="${c.complete?'ok':''}">${c.filled}/${c.total} Kernangaben gepflegt</span></div>
            <div class="catalog-actions"><button type="button" class="primary" data-site-save="${esc(location)}">Standort speichern</button></div>
          </div>`;
        }).join('')}
      </div>`;
  }

  function slug(value) {
    return String(value).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  }

  function saveSite(location) {
    const data = loadAll();
    const id = slug(location);
    data[location] = {
      name: location,
      address: qs(`site-address-${id}`)?.value.trim() || '',
      publicTransport: qs(`site-public-${id}`)?.value.trim() || '',
      carArrival: qs(`site-car-${id}`)?.value.trim() || '',
      parking: qs(`site-parking-${id}`)?.value.trim() || '',
      reception: qs(`site-reception-${id}`)?.value.trim() || '',
      building: qs(`site-building-${id}`)?.value.trim() || '',
      visitorNotes: qs(`site-visitor-${id}`)?.value.trim() || '',
      accessibility: qs(`site-access-${id}`)?.value.trim() || '',
      contact: qs(`site-contact-${id}`)?.value.trim() || '',
      contactDetails: qs(`site-contactdetails-${id}`)?.value.trim() || '',
      mapsUrl: qs(`site-maps-${id}`)?.value.trim() || ''
    };
    saveAll(data);
    renderEditor();
    try { if (typeof toast === 'function') toast(`${location}: Standortinformationen gespeichert.`); } catch (_) {}
  }

  document.addEventListener('click', e => {
    const tab = e.target.closest('[data-catalog-tab="sites"]');
    if (tab) {
      e.preventDefault();
      e.stopImmediatePropagation();
      renderEditor();
      return;
    }
    const save = e.target.closest('[data-site-save]');
    if (save) {
      e.preventDefault();
      e.stopImmediatePropagation();
      saveSite(save.dataset.siteSave);
    }
  }, true);

  function init() {
    injectStyles();
    loadAll();
    ensureTab();
    const nav = document.querySelector('.catalog-nav');
    if (nav && !nav.__siteObserver) {
      const observer = new MutationObserver(ensureTab);
      observer.observe(nav, { childList:true });
      nav.__siteObserver = true;
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();