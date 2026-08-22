(function () {
  const CATALOG_KEY = 'conference_catalog_v2';
  const REQUEST_KEY = 'conference_requests';
  const PLAN_START = 6 * 60;
  const PLAN_END = 22 * 60;

  // Remove incompatible locally cached catalog data from older MVP builds.
  try {
    const raw = localStorage.getItem(CATALOG_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      const valid = data &&
        Array.isArray(data.rooms) &&
        Array.isArray(data.services) &&
        Array.isArray(data.cateringPackages) &&
        Array.isArray(data.cateringItems) &&
        data.cateringPackages.every(p => Array.isArray(p.variants));
      if (!valid) localStorage.removeItem(CATALOG_KEY);
    }
  } catch (_) {
    localStorage.removeItem(CATALOG_KEY);
  }

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
    })[c]);
  }

  function money(value) {
    return new Intl.NumberFormat('de-DE', { style:'currency', currency:'EUR' }).format(Number(value || 0));
  }

  function getStoredRequests() {
    try { return JSON.parse(localStorage.getItem(REQUEST_KEY) || '[]'); }
    catch (_) { return []; }
  }

  function timeToMinutes(value) {
    const parts = String(value || '').split(':').map(Number);
    return (parts[0] || 0) * 60 + (parts[1] || 0);
  }

  function todayValue() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function formatDate(value) {
    if (!value) return '';
    const [y,m,d] = value.split('-');
    return `${d}.${m}.${y}`;
  }

  function injectStyles() {
    if (document.getElementById('manager-extension-styles')) return;
    const style = document.createElement('style');
    style.id = 'manager-extension-styles';
    style.textContent = `
      .room-plan-panel { margin-top: 0; }
      .room-plan-controls { display:grid; grid-template-columns:180px 1fr auto auto; gap:12px; align-items:end; margin-bottom:18px; }
      .room-plan-controls label span { display:block; font-size:12px; font-weight:700; margin-bottom:6px; }
      .room-plan-summary { display:flex; gap:10px; flex-wrap:wrap; margin-bottom:14px; }
      .room-plan-summary .plan-kpi { background:#f3f3f3; border-left:4px solid #86bc25; padding:10px 14px; min-width:130px; }
      .room-plan-summary small { display:block; color:#63666a; margin-bottom:3px; }
      .room-plan-summary strong { font-size:18px; }
      .room-plan-wrap { overflow-x:auto; border:1px solid #d0d0ce; background:#fff; }
      .room-plan { min-width:980px; }
      .room-plan-head, .room-plan-row { display:grid; grid-template-columns:220px 1fr; }
      .room-plan-head { background:#000; color:#fff; position:sticky; top:0; z-index:2; }
      .room-plan-roomhead, .room-plan-room { padding:12px 14px; border-right:1px solid #d0d0ce; }
      .room-plan-roomhead { font-weight:700; }
      .room-plan-room { background:#fafafa; border-bottom:1px solid #d0d0ce; min-width:0; }
      .room-plan-room strong { display:block; margin-bottom:3px; }
      .room-plan-room small { color:#63666a; }
      .room-plan-axis, .room-plan-track { position:relative; min-height:54px; background-image:linear-gradient(to right, rgba(208,208,206,.7) 1px, transparent 1px); background-size:6.25% 100%; }
      .room-plan-axis { min-height:44px; }
      .room-plan-axis span { position:absolute; top:12px; transform:translateX(-50%); font-size:11px; color:#d0d0ce; white-space:nowrap; }
      .room-plan-row:last-child .room-plan-room, .room-plan-row:last-child .room-plan-track { border-bottom:0; }
      .room-plan-track { border-bottom:1px solid #d0d0ce; }
      .room-booking { position:absolute; top:8px; height:38px; min-width:36px; padding:5px 7px; overflow:hidden; border:1px solid #75787b; background:#f3f3f3; font-size:11px; line-height:1.2; cursor:default; }
      .room-booking.confirmed { background:#000; color:#fff; border-color:#000; box-shadow:inset 0 -4px 0 #86bc25; }
      .room-booking.tentative { background:#fff7e6; color:#6b4200; border-color:#d6a14d; }
      .room-booking.change { background:#ededed; color:#353535; border-color:#97999b; }
      .room-booking strong { display:block; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .room-booking span { white-space:nowrap; }
      .room-plan-empty { color:#75787b; font-size:12px; padding:19px 10px; }
      .room-plan-legend { display:flex; gap:16px; flex-wrap:wrap; margin-top:12px; color:#53565a; font-size:12px; }
      .room-plan-legend i { display:inline-block; width:14px; height:10px; margin-right:5px; vertical-align:middle; border:1px solid #97999b; }
      .room-plan-legend .confirmed { background:#000; border-bottom:3px solid #86bc25; }
      .room-plan-legend .tentative { background:#fff7e6; border-color:#d6a14d; }
      .room-plan-legend .change { background:#ededed; }
      .item-editor-grid { display:grid; grid-template-columns:1.1fr .8fr .7fr auto; gap:10px; align-items:end; }
      .item-editor-grid label span { font-size:12px; }
      .item-editor-actions { display:flex; gap:8px; justify-content:flex-end; align-items:center; }
      .item-editor-active { display:flex; gap:7px; align-items:center; padding-bottom:10px; }
      .item-editor-active input { width:auto; }
      @media(max-width:760px) {
        .room-plan-controls { grid-template-columns:1fr 1fr; }
        .item-editor-grid { grid-template-columns:1fr; }
        .item-editor-actions { justify-content:flex-start; }
      }
    `;
    document.head.appendChild(style);
  }

  function ensureExtendedUi() {
    const managerTabs = document.querySelector('.manager-tabs');
    if (managerTabs && !document.getElementById('roomPlanTab')) {
      const button = document.createElement('button');
      button.type = 'button';
      button.id = 'roomPlanTab';
      button.className = 'manager-tab';
      button.dataset.managerTab = 'roomplan';
      button.textContent = 'Raumplanung';
      managerTabs.appendChild(button);
    }

    const managerView = document.getElementById('managerView');
    if (managerView && !document.getElementById('managerRoomPlanPanel')) {
      const panel = document.createElement('div');
      panel.id = 'managerRoomPlanPanel';
      panel.className = 'card manager-panel room-plan-panel hidden';
      panel.innerHTML = `
        <div class="section-heading">
          <div><h2>Raumplanung</h2><p>Tagesübersicht aller Räume und Reservierungen von 06:00 bis 22:00 Uhr.</p></div>
        </div>
        <div class="room-plan-controls">
          <label><span>Datum</span><input id="roomPlanDate" type="date" value="${todayValue()}"></label>
          <label><span>Standort</span><select id="roomPlanLocation"></select></label>
          <button type="button" class="secondary" id="roomPlanToday">Heute</button>
          <button type="button" class="primary" id="roomPlanRefresh">Aktualisieren</button>
        </div>
        <div id="roomPlanContent"></div>`;
      managerView.appendChild(panel);
    }

    const catalogNav = document.querySelector('.catalog-nav');
    if (catalogNav && !document.getElementById('catalogItemsTab')) {
      const button = document.createElement('button');
      button.type = 'button';
      button.id = 'catalogItemsTab';
      button.className = 'catalog-tab';
      button.textContent = 'Einzeloptionen';
      catalogNav.appendChild(button);
    }
  }

  function activateManagerTab(tab) {
    try {
      if (typeof setManagerTab === 'function') setManagerTab(tab, false);
    } catch (err) {
      console.error('Manager tab error:', err);
    }

    document.querySelectorAll('[data-manager-tab]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.managerTab === tab);
    });
    document.getElementById('managerRequestsPanel')?.classList.toggle('hidden', tab !== 'requests');
    document.getElementById('managerCatalogPanel')?.classList.toggle('hidden', tab !== 'catalog');
    document.getElementById('managerRoomPlanPanel')?.classList.toggle('hidden', tab !== 'roomplan');

    if (tab === 'catalog') {
      try { if (typeof renderCatalog === 'function') renderCatalog(); }
      catch (err) { console.error('Catalog render error:', err); }
    }
    if (tab === 'roomplan') renderRoomPlan();
  }

  function activateCatalogTab(tab) {
    document.getElementById('catalogItemsTab')?.classList.remove('active');
    try {
      if (typeof setCatalogTab === 'function') setCatalogTab(tab);
    } catch (err) {
      console.error('Catalog tab error:', err);
    }
  }

  function syncQuantities() {
    try {
      if (typeof state === 'undefined' || typeof catalog === 'undefined') return;
      const old = state.quantities || {};
      state.quantities = Object.fromEntries(catalog.cateringItems.map(item => [item.id, Number(old[item.id] || 0)]));
    } catch (_) {}
  }

  function afterItemChange(message) {
    try { if (typeof saveCatalog === 'function') saveCatalog(); }
    catch (_) {
      try { localStorage.setItem(CATALOG_KEY, JSON.stringify(catalog)); } catch (_) {}
    }
    syncQuantities();
    try { if (typeof renderItems === 'function') renderItems(); } catch (_) {}
    try { if (typeof updateCosts === 'function') updateCosts(); } catch (_) {}
    try { if (typeof toast === 'function') toast(message); } catch (_) {}
    renderItemEditor();
  }

  function renderItemEditor() {
    const editor = document.getElementById('catalogEditor');
    if (!editor) return;
    document.querySelectorAll('[data-catalog-tab]').forEach(b => b.classList.remove('active'));
    document.getElementById('catalogItemsTab')?.classList.add('active');

    let items = [];
    try { items = catalog.cateringItems; } catch (_) {}

    editor.innerHTML = `
      <div class="catalog-section">
        <div class="info-box">Hier werden die zusätzlichen Einzelpositionen gepflegt, die Mitarbeitende unabhängig von einem Catering-Paket ergänzen können.</div>
        ${items.map(item => `
          <div class="catalog-row">
            <div class="item-editor-grid">
              <label><span>Bezeichnung</span><input id="item-name-${item.id}" value="${esc(item.name)}"></label>
              <label><span>Einheit</span><input id="item-unit-${item.id}" value="${esc(item.unit)}"></label>
              <label><span>Preis</span><input id="item-price-${item.id}" type="number" min="0" step="0.01" value="${Number(item.price || 0)}"></label>
              <label class="item-editor-active"><input id="item-active-${item.id}" type="checkbox" ${item.active !== false ? 'checked' : ''}> Aktiv</label>
            </div>
            <div class="item-editor-actions">
              <button type="button" class="danger-btn" data-item-remove="${item.id}">Entfernen</button>
              <button type="button" class="primary" data-item-save="${item.id}">Speichern</button>
            </div>
          </div>`).join('')}
        <div class="catalog-actions"><button type="button" class="secondary" id="addCateringItem">+ Einzeloption hinzufügen</button></div>
      </div>`;
  }

  function saveItem(id) {
    let item;
    try { item = catalog.cateringItems.find(x => x.id === id); } catch (_) { return; }
    if (!item) return;
    const name = document.getElementById(`item-name-${id}`)?.value.trim();
    const unit = document.getElementById(`item-unit-${id}`)?.value.trim();
    const price = Number(document.getElementById(`item-price-${id}`)?.value || 0);
    if (!name || !unit || price < 0) {
      try { toast('Bitte Bezeichnung, Einheit und einen gültigen Preis angeben.'); } catch (_) {}
      return;
    }
    item.name = name;
    item.unit = unit;
    item.price = price;
    item.active = !!document.getElementById(`item-active-${id}`)?.checked;
    afterItemChange('Einzeloption gespeichert.');
  }

  function addItem() {
    try {
      catalog.cateringItems.push({ id:'ITEM-' + Date.now(), name:'Neue Einzeloption', unit:'Stück', price:0, active:true });
      afterItemChange('Neue Einzeloption angelegt.');
    } catch (_) {}
  }

  function removeItem(id) {
    if (!window.confirm('Einzeloption wirklich entfernen? Bestehende Anfragen bleiben unverändert.')) return;
    try {
      catalog.cateringItems = catalog.cateringItems.filter(x => x.id !== id);
      afterItemChange('Einzeloption entfernt.');
    } catch (_) {}
  }

  function populateRoomPlanLocations() {
    const select = document.getElementById('roomPlanLocation');
    if (!select) return;
    let rooms = [];
    try { rooms = catalog.rooms.filter(r => r.active !== false); } catch (_) {}
    const current = select.value;
    const locations = [...new Set(rooms.map(r => r.location))].sort();
    select.innerHTML = `<option value="ALL">Alle Standorte</option>${locations.map(x => `<option value="${esc(x)}">${esc(x)}</option>`).join('')}`;
    if ([...locations, 'ALL'].includes(current)) select.value = current;
  }

  function renderRoomPlan() {
    const content = document.getElementById('roomPlanContent');
    const dateInput = document.getElementById('roomPlanDate');
    const locationInput = document.getElementById('roomPlanLocation');
    if (!content || !dateInput || !locationInput) return;

    populateRoomPlanLocations();
    const date = dateInput.value || todayValue();
    const location = locationInput.value || 'ALL';
    let rooms = [];
    try { rooms = catalog.rooms.filter(r => r.active !== false && (location === 'ALL' || r.location === location)); } catch (_) {}
    const roomIds = new Set(rooms.map(r => r.id));
    const requests = getStoredRequests().filter(r =>
      r.date === date && roomIds.has(r.roomId) && !['Rejected','Cancelled'].includes(r.status)
    );

    const bookedRoomIds = new Set(requests.map(r => r.roomId));
    const confirmed = requests.filter(r => r.status === 'Confirmed' || r.calendarStatus === 'Busy').length;
    const tentative = requests.filter(r => r.calendarStatus === 'Tentative').length;

    const ticks = [];
    for (let min = PLAN_START; min <= PLAN_END; min += 60) {
      const left = ((min - PLAN_START) / (PLAN_END - PLAN_START)) * 100;
      ticks.push(`<span style="left:${left}%">${String(Math.floor(min/60)).padStart(2,'0')}:00</span>`);
    }

    const rows = rooms.map(room => {
      const bookings = requests.filter(r => r.roomId === room.id && timeToMinutes(r.end) > PLAN_START && timeToMinutes(r.start) < PLAN_END);
      const bookingHtml = bookings.map(r => {
        const rawStart = timeToMinutes(r.start);
        const rawEnd = timeToMinutes(r.end);
        const start = Math.max(PLAN_START, rawStart);
        const end = Math.min(PLAN_END, rawEnd);
        const left = ((start - PLAN_START) / (PLAN_END - PLAN_START)) * 100;
        const width = Math.max(1.8, ((end - start) / (PLAN_END - PLAN_START)) * 100);
        const cls = r.status === 'Confirmed' || r.calendarStatus === 'Busy' ? 'confirmed' : (r.status === 'Change Requested' ? 'change' : 'tentative');
        const total = r.participants ?? ((r.internalParticipants || 0) + (r.externalParticipants || 0));
        return `<div class="room-booking ${cls}" style="left:${left}%;width:${width}%" title="${esc(r.title)} · ${esc(r.start)}–${esc(r.end)} · ${total} Teilnehmende">
          <strong>${esc(r.title)}</strong><span>${esc(r.start)}–${esc(r.end)} · ${total} P.</span>
        </div>`;
      }).join('');
      return `<div class="room-plan-row">
        <div class="room-plan-room"><strong>${esc(room.name)}</strong><small>${esc(room.location)} · ${room.capacity} Personen</small></div>
        <div class="room-plan-track">${bookingHtml || '<div class="room-plan-empty">Frei</div>'}</div>
      </div>`;
    }).join('');

    content.innerHTML = `
      <div class="room-plan-summary">
        <div class="plan-kpi"><small>Datum</small><strong>${formatDate(date)}</strong></div>
        <div class="plan-kpi"><small>Räume</small><strong>${rooms.length}</strong></div>
        <div class="plan-kpi"><small>Belegte Räume</small><strong>${bookedRoomIds.size}</strong></div>
        <div class="plan-kpi"><small>Bestätigt / Tentative</small><strong>${confirmed} / ${tentative}</strong></div>
      </div>
      <div class="room-plan-wrap">
        <div class="room-plan">
          <div class="room-plan-head"><div class="room-plan-roomhead">Raum</div><div class="room-plan-axis">${ticks.join('')}</div></div>
          ${rows || '<div class="info-box" style="margin:14px">Keine aktiven Räume für diesen Standort vorhanden.</div>'}
        </div>
      </div>
      <div class="room-plan-legend"><span><i class="confirmed"></i>Bestätigt</span><span><i class="tentative"></i>Tentative</span><span><i class="change"></i>Änderung angefordert</span></div>`;
  }

  document.addEventListener('DOMContentLoaded', function () {
    injectStyles();
    ensureExtendedUi();

    document.querySelectorAll('[data-manager-tab]').forEach(btn => {
      btn.style.pointerEvents = 'auto';
      btn.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        activateManagerTab(btn.dataset.managerTab);
      }, true);
    });

    document.querySelectorAll('[data-catalog-tab]').forEach(btn => {
      btn.style.pointerEvents = 'auto';
      btn.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        activateCatalogTab(btn.dataset.catalogTab);
      }, true);
    });

    document.getElementById('catalogItemsTab')?.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      renderItemEditor();
    }, true);

    document.getElementById('roomPlanDate')?.addEventListener('change', renderRoomPlan);
    document.getElementById('roomPlanLocation')?.addEventListener('change', renderRoomPlan);
    document.getElementById('roomPlanRefresh')?.addEventListener('click', renderRoomPlan);
    document.getElementById('roomPlanToday')?.addEventListener('click', function () {
      const input = document.getElementById('roomPlanDate');
      if (input) input.value = todayValue();
      renderRoomPlan();
    });

    document.addEventListener('click', function (event) {
      const save = event.target.closest('[data-item-save]');
      if (save) { event.preventDefault(); saveItem(save.dataset.itemSave); return; }
      const remove = event.target.closest('[data-item-remove]');
      if (remove) { event.preventDefault(); removeItem(remove.dataset.itemRemove); return; }
      if (event.target.closest('#addCateringItem')) { event.preventDefault(); addItem(); }
    });
  });
})();
