(function () {
  const CATALOG_KEY = 'conference_catalog_v2';

  const FLOORPLAN_DEFAULTS = {
    'BER-321': { floor: '3. OG', description: 'Kompakter Besprechungsraum mit Tischinsel für bis zu 12 Personen und Display an der Stirnseite.' },
    'BER-412': { floor: '4. OG', description: 'Großer Konferenzraum mit zentralem Boardtable, zwei Displays und Präsentationsfläche.' },
    'BER-AUD': { floor: 'EG', description: 'Auditorium mit Bühnenbereich, Reihenbestuhlung und Hybrid-Event-Setup.' },
    'STR-201': { floor: '2. OG', description: 'Mittlerer Meetingraum mit Tischgruppe und Fokus auf kleinere Workshops.' },
    'STR-ATR': { floor: 'EG', description: 'Offene Atriumfläche für Townhalls, Events und größere Gruppen.' },
    'FRA-105': { floor: '1. OG', description: 'Moderner Meetingraum mit Boardtable, Whiteboard und Teams-Setup.' }
  };

  const qs = id => document.getElementById(id);
  const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[c]));
  const clone = v => JSON.parse(JSON.stringify(v));

  function createFloorplanSvg(room) {
    const title = esc(room.name || 'Raum');
    const floor = esc(room.floor || 'Etage');
    const capacity = String(room.capacity || '?');
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="760" viewBox="0 0 1200 760">
        <rect width="1200" height="760" fill="#f6f6f6"/>
        <rect x="60" y="70" width="1080" height="620" rx="8" fill="#ffffff" stroke="#000000" stroke-width="6"/>
        <rect x="80" y="90" width="1040" height="110" fill="#000000"/>
        <text x="110" y="160" font-family="Arial, sans-serif" font-size="44" font-weight="700" fill="#ffffff">${title}</text>
        <circle cx="1035" cy="145" r="18" fill="#86bc25"/>
        <text x="80" y="250" font-family="Arial, sans-serif" font-size="28" fill="#63666a">Floorplan / Grundriss</text>
        <text x="80" y="288" font-family="Arial, sans-serif" font-size="24" fill="#63666a">${floor} · Kapazität ${capacity}</text>
        <rect x="130" y="330" width="940" height="280" rx="8" fill="#fbfbfb" stroke="#000000" stroke-width="4"/>
        <rect x="220" y="385" width="430" height="170" rx="14" fill="#e8ecef" stroke="#000000" stroke-width="3"/>
        <text x="435" y="478" text-anchor="middle" font-family="Arial, sans-serif" font-size="32" font-weight="700" fill="#000000">Meeting Table</text>
        <rect x="710" y="365" width="240" height="50" rx="4" fill="#d0d0ce" stroke="#000" stroke-width="2"/>
        <text x="830" y="398" text-anchor="middle" font-family="Arial, sans-serif" font-size="24" fill="#000">Display / Screen</text>
        <rect x="725" y="445" width="210" height="130" rx="4" fill="#eef7df" stroke="#86bc25" stroke-width="3"/>
        <text x="830" y="498" text-anchor="middle" font-family="Arial, sans-serif" font-size="26" fill="#046a38">Präsentation</text>
        <text x="830" y="530" text-anchor="middle" font-family="Arial, sans-serif" font-size="20" fill="#046a38">Whiteboard / Stage</text>
        <rect x="160" y="625" width="170" height="24" fill="#000"/>
        <polygon points="330,615 360,637 330,659" fill="#000"/>
        <text x="160" y="610" font-family="Arial, sans-serif" font-size="22" fill="#000">Eingang</text>
      </svg>`;
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  }

  function getCatalog() {
    try { return JSON.parse(localStorage.getItem(CATALOG_KEY) || 'null'); } catch { return null; }
  }

  function saveCatalog(data) {
    localStorage.setItem(CATALOG_KEY, JSON.stringify(data));
    try {
      if (typeof catalog !== 'undefined' && catalog) {
        catalog.rooms = clone(data.rooms || []);
        catalog.services = clone(data.services || []);
        catalog.cateringPackages = clone(data.cateringPackages || []);
        catalog.cateringItems = clone(data.cateringItems || []);
      }
    } catch (_) {}
  }

  function runtimeCatalog() {
    try {
      if (typeof catalog !== 'undefined' && catalog && Array.isArray(catalog.rooms)) return catalog;
    } catch (_) {}
    return null;
  }

  function ensureFloorplans() {
    const stored = getCatalog();
    const data = stored && Array.isArray(stored.rooms) ? stored : runtimeCatalog();
    if (!data || !Array.isArray(data.rooms)) return;
    let changed = false;
    data.rooms = data.rooms.map(room => {
      const next = { ...room };
      const defaults = FLOORPLAN_DEFAULTS[next.id] || {};
      if (!next.floor) { next.floor = defaults.floor || 'Etage unbekannt'; changed = true; }
      if (!next.floorplanDescription) { next.floorplanDescription = defaults.description || `Standardraum für bis zu ${next.capacity || '?'} Personen.`; changed = true; }
      if (!next.floorplanImage) { next.floorplanImage = createFloorplanSvg(next); changed = true; }
      return next;
    });
    if (changed) saveCatalog(data);
  }

  function getRoom(id) {
    try {
      if (typeof catalog !== 'undefined' && catalog?.rooms) {
        return catalog.rooms.find(r => r.id === id);
      }
    } catch (_) {}
    const data = getCatalog();
    return data?.rooms?.find(r => r.id === id);
  }

  function injectStyles() {
    if (qs('floorplanExtensionStyles')) return;
    const style = document.createElement('style');
    style.id = 'floorplanExtensionStyles';
    style.textContent = `
      .employee-floorplan{margin-top:14px;border-top:1px solid #d0d0ce;padding-top:12px;display:grid;grid-template-columns:120px 1fr;gap:12px;align-items:start}
      .employee-floorplan img{width:120px;height:82px;object-fit:cover;border:1px solid #d0d0ce;background:#f3f3f3}
      .employee-floorplan h4{margin:0 0 4px;font-size:14px}
      .employee-floorplan p{margin:0 0 8px;color:#63666a;font-size:13px;line-height:1.35}
      .employee-floorplan .meta{font-size:12px;font-weight:700;color:#046a38;margin-bottom:6px}
      .floorplan-modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.55);display:none;align-items:center;justify-content:center;z-index:9999;padding:16px}
      .floorplan-modal-overlay.open{display:flex}
      .floorplan-modal{background:#fff;max-width:1020px;width:min(1020px,100%);max-height:90vh;overflow:auto;border:1px solid #d0d0ce;box-shadow:0 24px 60px rgba(0,0,0,.22)}
      .floorplan-modal-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;padding:18px 20px;border-bottom:1px solid #d0d0ce}
      .floorplan-modal-head h3{margin:0;font-size:24px}
      .floorplan-modal-head p{margin:6px 0 0;color:#63666a}
      .floorplan-modal-body{padding:18px 20px;display:grid;grid-template-columns:1.5fr .9fr;gap:16px}
      .floorplan-modal-body img{width:100%;height:auto;border:1px solid #d0d0ce;background:#f6f6f6}
      .floorplan-sidecard{background:#f7f7f7;border:1px solid #d0d0ce;padding:14px}
      .floorplan-sidecard h4{margin:0 0 8px}
      .floorplan-sidecard p{margin:0 0 12px;color:#63666a;line-height:1.45}
      .room-floorplan-fields{margin-top:14px;padding-top:14px;border-top:1px dashed #d0d0ce;display:grid;gap:10px}
      .room-floorplan-grid{display:grid;grid-template-columns:.8fr 1.4fr;gap:10px}
      .room-floorplan-preview{max-width:180px;border:1px solid #d0d0ce;background:#fff}
      @media(max-width:760px){.employee-floorplan{grid-template-columns:1fr}.employee-floorplan img{width:100%;height:120px}.floorplan-modal-body{grid-template-columns:1fr}.room-floorplan-grid{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function ensureModal() {
    if (qs('floorplanModalOverlay')) return;
    const modal = document.createElement('div');
    modal.id = 'floorplanModalOverlay';
    modal.className = 'floorplan-modal-overlay';
    modal.innerHTML = `
      <div class="floorplan-modal" role="dialog" aria-modal="true" aria-labelledby="floorplanModalTitle">
        <div class="floorplan-modal-head">
          <div>
            <h3 id="floorplanModalTitle">Floorplan</h3>
            <p id="floorplanModalSubtitle"></p>
          </div>
          <button type="button" class="secondary" id="closeFloorplanModal">Schließen</button>
        </div>
        <div class="floorplan-modal-body">
          <img id="floorplanModalImage" alt="Floorplan Ansicht">
          <div class="floorplan-sidecard">
            <h4>Raumeindruck</h4>
            <p id="floorplanModalDescription"></p>
            <h4>Wichtige Infos</h4>
            <p id="floorplanModalMeta"></p>
          </div>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
    qs('closeFloorplanModal')?.addEventListener('click', closeModal);
  }

  function openModal(roomId) {
    const room = getRoom(roomId);
    if (!room) return;
    ensureModal();
    qs('floorplanModalTitle').textContent = room.name || 'Floorplan';
    qs('floorplanModalSubtitle').textContent = `${room.floor || 'Etage unbekannt'} · Kapazität ${room.capacity || '?'} Personen`;
    qs('floorplanModalImage').src = room.floorplanImage || createFloorplanSvg(room);
    qs('floorplanModalDescription').textContent = room.floorplanDescription || 'Keine Beschreibung vorhanden.';
    qs('floorplanModalMeta').textContent = `${room.location || ''}${room.equipment ? ' · ' + room.equipment : ''}`;
    qs('floorplanModalOverlay').classList.add('open');
  }

  function closeModal() {
    qs('floorplanModalOverlay')?.classList.remove('open');
  }

  function decorateRoomCards() {
    qsa('#rooms [data-room]').forEach(card => {
      const room = getRoom(card.dataset.room);
      if (!room) return;
      if (card.querySelector('.employee-floorplan')) return;
      const block = document.createElement('div');
      block.className = 'employee-floorplan';
      block.innerHTML = `
        <img src="${esc(room.floorplanImage || createFloorplanSvg(room))}" alt="Floorplan ${esc(room.name)}">
        <div>
          <div class="meta">${esc(room.floor || 'Etage unbekannt')}</div>
          <h4>Raumaufbau ansehen</h4>
          <p>${esc(room.floorplanDescription || 'Keine Beschreibung vorhanden.')}</p>
          <button type="button" class="secondary" data-open-floorplan="${room.id}">Floorplan anzeigen</button>
        </div>`;
      card.appendChild(block);
    });
  }

  function watchRooms() {
    const rooms = qs('rooms');
    if (!rooms || rooms.__floorplanObserved) return;
    const observer = new MutationObserver(() => decorateRoomCards());
    observer.observe(rooms, { childList: true, subtree: true });
    rooms.__floorplanObserved = true;
    decorateRoomCards();
  }

  function enhanceRoomEditor() {
    qsa('[data-room-save]').forEach(btn => {
      const id = btn.dataset.roomSave;
      const row = btn.closest('.catalog-row');
      if (!row || row.querySelector('.room-floorplan-fields')) return;
      const room = getRoom(id);
      if (!room) return;
      const block = document.createElement('div');
      block.className = 'room-floorplan-fields';
      block.innerHTML = `
        <div class="room-floorplan-grid">
          <label><span>Etage</span><input id="room-floor-${id}" value="${esc(room.floor || '')}"></label>
          <label><span>Floorplan Bild-URL</span><input id="room-floorplanImage-${id}" value="${esc(room.floorplanImage || '')}"></label>
        </div>
        <label><span>Beschreibung / Layout</span><textarea id="room-floorplanDescription-${id}">${esc(room.floorplanDescription || '')}</textarea></label>
        <img class="room-floorplan-preview" id="room-floorplanPreview-${id}" src="${esc(room.floorplanImage || createFloorplanSvg(room))}" alt="Floorplan Vorschau">
      `;
      row.insertBefore(block, row.querySelector('.catalog-actions') || null);
      qs(`room-floorplanImage-${id}`)?.addEventListener('input', e => {
        const preview = qs(`room-floorplanPreview-${id}`);
        if (preview) preview.src = e.target.value.trim() || createFloorplanSvg(room);
      });
    });
  }

  function watchCatalogEditor() {
    const editor = qs('catalogEditor');
    if (!editor || editor.__floorplanObserved) return;
    const observer = new MutationObserver(() => enhanceRoomEditor());
    observer.observe(editor, { childList: true, subtree: true });
    editor.__floorplanObserved = true;
    enhanceRoomEditor();
  }

  function patchSaveRoom() {
    if (typeof window.saveRoom !== 'function' || window.saveRoom.__floorplanPatched) return;
    const original = window.saveRoom;
    window.saveRoom = function (id) {
      const extras = {
        floor: qs(`room-floor-${id}`)?.value?.trim() || '',
        description: qs(`room-floorplanDescription-${id}`)?.value?.trim() || '',
        image: qs(`room-floorplanImage-${id}`)?.value?.trim() || ''
      };
      original(id);
      const data = getCatalog() || runtimeCatalog();
      const room = data?.rooms?.find(r => r.id === id);
      if (room) {
        room.floor = extras.floor || room.floor || 'Etage unbekannt';
        room.floorplanDescription = extras.description || room.floorplanDescription || '';
        room.floorplanImage = extras.image || room.floorplanImage || createFloorplanSvg(room);
        saveCatalog(data);
      }
      try { if (typeof renderRooms === 'function') renderRooms(); } catch (_) {}
      decorateRoomCards();
    };
    window.saveRoom.__floorplanPatched = true;
  }

  document.addEventListener('click', e => {
    const open = e.target.closest('[data-open-floorplan]');
    if (open) {
      e.preventDefault();
      openModal(open.dataset.openFloorplan);
    }
  });

  document.addEventListener('DOMContentLoaded', function () {
    injectStyles();
    ensureFloorplans();
    ensureModal();
    watchRooms();
    watchCatalogEditor();
    patchSaveRoom();
  });
})();
