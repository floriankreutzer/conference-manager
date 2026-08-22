(function () {
  const REQUEST_KEY = 'conference_requests';
  const CATALOG_KEY = 'conference_catalog_v2';

  const qs = id => document.getElementById(id);
  const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const euro = new Intl.NumberFormat('de-DE', { style:'currency', currency:'EUR' });

  const siteInfo = {
    Berlin: {
      address: 'Standort Berlin - Adresse im Produktivsystem pflegen',
      arrival: 'ÖPNV-Anfahrt bitte vor Versand des Willkommens-PDF zentral ergänzen.',
      parking: 'Parkmöglichkeiten, Zufahrt und ggf. Kennzeichenerfassung bitte ergänzen.',
      building: 'Bitte am Empfang anmelden. Von dort erfolgt die Wegweisung zum gebuchten Raum.',
      contact: 'Conference Management / Empfang'
    },
    Stuttgart: {
      address: 'Standort Stuttgart - Adresse im Produktivsystem pflegen',
      arrival: 'ÖPNV-Anfahrt bitte vor Versand des Willkommens-PDF zentral ergänzen.',
      parking: 'Parkhaus, Besucherstellplätze und Zufahrt bitte ergänzen.',
      building: 'Bitte am Empfang anmelden und den Veranstaltungsnamen nennen.',
      contact: 'Conference Management / Empfang'
    },
    Frankfurt: {
      address: 'Standort Frankfurt - Adresse im Produktivsystem pflegen',
      arrival: 'ÖPNV-Anfahrt bitte vor Versand des Willkommens-PDF zentral ergänzen.',
      parking: 'Parkmöglichkeiten und Besucherzufahrt bitte ergänzen.',
      building: 'Bitte am Empfang anmelden. Der Raum und die Etage werden dort bestätigt.',
      contact: 'Conference Management / Empfang'
    }
  };

  function getRequests() {
    try { return JSON.parse(localStorage.getItem(REQUEST_KEY) || '[]'); } catch { return []; }
  }

  function getCatalog() {
    try { return JSON.parse(localStorage.getItem(CATALOG_KEY) || 'null'); } catch { return null; }
  }

  function getRequest(id) {
    return getRequests().find(r => r.id === id);
  }

  function getRoom(request) {
    const catalog = getCatalog();
    return catalog?.rooms?.find(r => r.id === request.roomId) || null;
  }

  function statusLabel(status) {
    return ({
      Submitted:'Zur Prüfung',
      Confirmed:'Bestätigt',
      Rejected:'Abgelehnt',
      'Change Requested':'Änderung angefordert',
      Cancelled:'Storniert'
    })[status] || status || '—';
  }

  function fmtDate(d) {
    return d ? new Date(d + 'T12:00:00').toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit', year:'numeric' }) : '—';
  }

  function injectStyles() {
    if (qs('requestDetailStyles')) return;
    const style = document.createElement('style');
    style.id = 'requestDetailStyles';
    style.textContent = `
      .request-detail-overlay{position:fixed;inset:0;background:rgba(0,0,0,.55);display:none;align-items:center;justify-content:center;z-index:10000;padding:16px}
      .request-detail-overlay.open{display:flex}
      .request-detail-modal{background:#fff;width:min(1080px,100%);max-height:92vh;overflow:auto;border:1px solid #d0d0ce;box-shadow:0 24px 70px rgba(0,0,0,.25)}
      .request-detail-head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;padding:20px 22px;border-bottom:1px solid #d0d0ce}
      .request-detail-head h2{margin:0 0 5px;font-size:25px}
      .request-detail-head p{margin:0;color:#63666a}
      .request-detail-body{padding:20px 22px}
      .detail-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:18px}
      .detail-summary>div,.detail-card{border:1px solid #d0d0ce;background:#fafafa;padding:13px}
      .detail-summary small,.detail-card small{display:block;color:#63666a;margin-bottom:4px}
      .detail-summary strong{display:block;font-size:16px}
      .detail-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
      .detail-card h3{margin:0 0 10px;border-bottom:3px solid #86bc25;padding-bottom:7px;font-size:17px}
      .detail-card p{margin:6px 0;color:#53565a;line-height:1.4}
      .detail-floorplan{width:100%;max-height:260px;object-fit:contain;background:#fff;border:1px solid #d0d0ce;margin-top:8px}
      .detail-actions{display:flex;flex-wrap:wrap;gap:10px;padding:18px 22px;border-top:1px solid #d0d0ce;background:#fafafa}
      .detail-actions .spacer{flex:1}
      .detail-pdf-note{margin-top:12px;padding:11px 13px;border-left:4px solid #86bc25;background:#f5f5f5;color:#53565a;font-size:13px}
      @media(max-width:760px){.detail-summary,.detail-grid{grid-template-columns:1fr}.request-detail-head{align-items:flex-start}.request-detail-modal{max-height:94vh}}
    `;
    document.head.appendChild(style);
  }

  function ensureModal() {
    if (qs('requestDetailOverlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'requestDetailOverlay';
    overlay.className = 'request-detail-overlay';
    overlay.innerHTML = `
      <div class="request-detail-modal" role="dialog" aria-modal="true" aria-labelledby="requestDetailTitle">
        <div class="request-detail-head">
          <div><h2 id="requestDetailTitle">Buchungsdetails</h2><p id="requestDetailSubtitle"></p></div>
          <button type="button" class="secondary" id="closeRequestDetail">Schließen</button>
        </div>
        <div class="request-detail-body" id="requestDetailBody"></div>
        <div class="detail-actions">
          <button type="button" class="secondary" id="requestDetailFloorplan">Floorplan anzeigen</button>
          <div class="spacer"></div>
          <button type="button" class="primary" id="welcomePdfBtn">Willkommens-PDF erstellen</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
    qs('closeRequestDetail')?.addEventListener('click', closeModal);
    qs('welcomePdfBtn')?.addEventListener('click', () => {
      const id = qs('welcomePdfBtn').dataset.requestId;
      if (id) createWelcomePdf(id);
    });
    qs('requestDetailFloorplan')?.addEventListener('click', () => {
      const id = qs('requestDetailFloorplan').dataset.roomId;
      if (!id) return;
      const btn = document.querySelector(`[data-open-floorplan="${CSS.escape(id)}"]`);
      if (btn) btn.click();
    });
  }

  function buildServices(request, catalog) {
    const ids = request.serviceIds || [];
    const list = ids.map(id => catalog?.services?.find(s => s.id === id)?.name || id).filter(Boolean);
    return list.length ? list.join(' · ') : 'Keine zusätzlichen Services';
  }

  function buildItems(request, catalog) {
    const quantities = request.quantities || {};
    const parts = Object.entries(quantities)
      .filter(([,qty]) => Number(qty) > 0)
      .map(([id,qty]) => `${qty}× ${catalog?.cateringItems?.find(i => i.id === id)?.name || id}`);
    return parts.length ? parts.join(' · ') : 'Keine Einzeloptionen';
  }

  function buildAllocations(request) {
    const allocations = request.allocations || [];
    return allocations.length
      ? allocations.map(a => `${esc(a.costCenter || '—')} · ${Number(a.percent || 0)} %`).join('<br>')
      : 'Keine Kostenverteilung hinterlegt';
  }

  function openModal(id) {
    const request = getRequest(id);
    if (!request) return;
    ensureModal();
    const catalog = getCatalog();
    const room = getRoom(request);
    const internal = request.internalParticipants ?? request.participants ?? 0;
    const external = request.externalParticipants ?? 0;
    const total = request.participants ?? (Number(internal) + Number(external));
    const packageText = request.packageSelection
      ? `${request.packageSelection.packageName || request.packageSelection.packageId} · ${request.packageSelection.tier}`
      : 'Kein Catering-Paket';

    qs('requestDetailTitle').textContent = request.title || 'Buchungsdetails';
    qs('requestDetailSubtitle').textContent = `${request.id} · ${statusLabel(request.status)}`;
    qs('requestDetailBody').innerHTML = `
      <div class="detail-summary">
        <div><small>Datum</small><strong>${fmtDate(request.date)}</strong></div>
        <div><small>Zeit</small><strong>${esc(request.start)}–${esc(request.end)}</strong></div>
        <div><small>Status</small><strong>${esc(statusLabel(request.status))}</strong></div>
        <div><small>Gesamtkosten</small><strong>${euro.format(request.estimatedCost || 0)}</strong></div>
      </div>
      <div class="detail-grid">
        <div class="detail-card">
          <h3>Raum & Standort</h3>
          <p><strong>${esc(room?.name || request.roomId || '—')}</strong></p>
          <p>${esc(request.location || room?.location || '—')} · ${esc(room?.floor || 'Etage nicht hinterlegt')}</p>
          <p>${esc(room?.equipment || 'Keine Ausstattungsinformationen')}</p>
          ${room?.floorplanImage ? `<img class="detail-floorplan" src="${esc(room.floorplanImage)}" alt="Floorplan ${esc(room.name)}">` : ''}
        </div>
        <div class="detail-card">
          <h3>Teilnehmende</h3>
          <p><strong>${total} Personen</strong></p>
          <p>${internal} intern · ${external} extern</p>
          <p>Kalenderstatus: ${esc(request.calendarStatus || '—')}</p>
        </div>
        <div class="detail-card">
          <h3>Services</h3>
          <p>${esc(buildServices(request, catalog))}</p>
        </div>
        <div class="detail-card">
          <h3>Bewirtung</h3>
          <p><strong>${esc(packageText)}</strong></p>
          <p>${esc(buildItems(request, catalog))}</p>
        </div>
        <div class="detail-card">
          <h3>Kostenverteilung</h3>
          <p>${buildAllocations(request)}</p>
        </div>
        <div class="detail-card">
          <h3>Willkommen für Gäste</h3>
          <p>Für bestätigte Buchungen kann aus diesen Daten eine druckfertige Teilnehmerinformation erzeugt werden.</p>
          <div class="detail-pdf-note">MVP: Anfahrt, Parken und Gebäudeinformationen sind als pflegbare Standortdaten vorgesehen. Aktuell werden klar gekennzeichnete Platzhalter verwendet.</div>
        </div>
      </div>`;

    const pdfBtn = qs('welcomePdfBtn');
    pdfBtn.dataset.requestId = request.id;
    pdfBtn.disabled = request.status !== 'Confirmed';
    pdfBtn.title = request.status === 'Confirmed' ? 'Willkommens-PDF erstellen' : 'PDF ist nach Bestätigung der Buchung verfügbar';
    pdfBtn.style.opacity = request.status === 'Confirmed' ? '1' : '.5';

    const floorBtn = qs('requestDetailFloorplan');
    floorBtn.dataset.roomId = room?.id || '';
    floorBtn.disabled = !room?.floorplanImage;
    floorBtn.style.opacity = room?.floorplanImage ? '1' : '.5';

    qs('requestDetailOverlay').classList.add('open');
  }

  function closeModal() {
    qs('requestDetailOverlay')?.classList.remove('open');
  }

  function extractRequestId(card) {
    const text = card.querySelector('.request-meta')?.textContent || '';
    const match = text.match(/CR-\d{4}-\d+/);
    return match ? match[0] : null;
  }

  function decorateRequestCards() {
    qsa('#requestList .request-card').forEach(card => {
      if (card.querySelector('[data-request-detail]')) return;
      const id = extractRequestId(card);
      if (!id) return;
      let actions = card.querySelector('.request-actions');
      if (!actions) {
        actions = document.createElement('div');
        actions.className = 'request-actions';
        card.appendChild(actions);
      }
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'secondary';
      btn.dataset.requestDetail = id;
      btn.textContent = 'Details anzeigen';
      actions.insertBefore(btn, actions.firstChild);
    });
  }

  function watchRequestList() {
    const list = qs('requestList');
    if (!list || list.__detailObserved) return;
    const observer = new MutationObserver(decorateRequestCards);
    observer.observe(list, { childList:true, subtree:true });
    list.__detailObserved = true;
    decorateRequestCards();
  }

  function createWelcomePdf(id) {
    const request = getRequest(id);
    if (!request || request.status !== 'Confirmed') return;
    const catalog = getCatalog();
    const room = getRoom(request);
    const location = request.location || room?.location || 'Standort';
    const info = siteInfo[location] || {
      address: `${location} - Adresse im Produktivsystem pflegen`,
      arrival: 'Anfahrtsbeschreibung bitte ergänzen.',
      parking: 'Parkinformationen bitte ergänzen.',
      building: 'Gebäude- und Empfangsinformationen bitte ergänzen.',
      contact: 'Conference Management'
    };
    const internal = request.internalParticipants ?? request.participants ?? 0;
    const external = request.externalParticipants ?? 0;
    const total = request.participants ?? (Number(internal) + Number(external));
    const catering = request.packageSelection
      ? `${request.packageSelection.packageName || request.packageSelection.packageId} - ${request.packageSelection.tier}`
      : 'Keine Bewirtung vorgesehen';
    const services = buildServices(request, catalog);
    const floorplan = room?.floorplanImage || '';

    const win = window.open('', '_blank');
    if (!win) return;
    win.document.open();
    win.document.write(`<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Willkommen - ${esc(request.title)}</title><style>
      @page{size:A4;margin:14mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#000;margin:0;font-size:11pt;line-height:1.45}header{border-bottom:5px solid #86bc25;padding:0 0 14px;margin-bottom:22px}header .brand{font-size:13px;font-weight:700;margin-bottom:16px}h1{font-size:28px;margin:0 0 5px}h2{font-size:16px;margin:0 0 8px;border-bottom:2px solid #86bc25;padding-bottom:5px}p{margin:5px 0}.lead{font-size:14px;color:#53565a}.meta{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:18px}.box{border:1px solid #d0d0ce;padding:11px;background:#fafafa}.box small{display:block;color:#63666a;margin-bottom:3px}.sections{display:grid;grid-template-columns:1fr 1fr;gap:12px}.section{border:1px solid #d0d0ce;padding:13px;break-inside:avoid}.floorplan{width:100%;max-height:260px;object-fit:contain;border:1px solid #d0d0ce;margin-top:8px}.notice{margin-top:18px;padding:10px 12px;background:#f5f5f5;border-left:4px solid #86bc25;color:#53565a;font-size:9.5pt}footer{margin-top:18px;padding-top:10px;border-top:1px solid #d0d0ce;color:#63666a;font-size:9pt}@media print{.print-actions{display:none}}@media(max-width:640px){.meta,.sections{grid-template-columns:1fr}}.print-actions{margin:16px 0}.print-actions button{padding:10px 14px;background:#000;color:#fff;border:0;font-weight:700}
    </style></head><body>
      <div class="print-actions"><button onclick="window.print()">Als PDF drucken / sichern</button></div>
      <header><div class="brand">Conference Manager</div><h1>Willkommen</h1><div class="lead">${esc(request.title)}</div></header>
      <div class="meta">
        <div class="box"><small>Datum</small><strong>${fmtDate(request.date)}</strong></div>
        <div class="box"><small>Zeit</small><strong>${esc(request.start)}-${esc(request.end)}</strong></div>
        <div class="box"><small>Raum</small><strong>${esc(room?.name || request.roomId || '—')}</strong><br>${esc(room?.floor || '')}</div>
        <div class="box"><small>Teilnehmende</small><strong>${total}</strong></div>
      </div>
      <div class="sections">
        <div class="section"><h2>Anfahrt</h2><p><strong>${esc(info.address)}</strong></p><p>${esc(info.arrival)}</p></div>
        <div class="section"><h2>Parken</h2><p>${esc(info.parking)}</p></div>
        <div class="section"><h2>Im Gebäude</h2><p>${esc(info.building)}</p><p><strong>Kontakt:</strong> ${esc(info.contact)}</p></div>
        <div class="section"><h2>Raum & Ausstattung</h2><p>${esc(room?.equipment || 'Keine weiteren Angaben')}</p>${floorplan ? `<img class="floorplan" src="${esc(floorplan)}" alt="Floorplan">` : ''}</div>
        <div class="section"><h2>Bewirtung</h2><p>${esc(catering)}</p><p>${esc(buildItems(request, catalog))}</p></div>
        <div class="section"><h2>Services vor Ort</h2><p>${esc(services)}</p></div>
      </div>
      <div class="notice"><strong>MVP-Hinweis:</strong> Standortbezogene Anfahrts-, Park- und Gebäudeinformationen sind aktuell Platzhalter und müssen vor einem realen Versand durch das Conference Management gepflegt werden.</div>
      <footer>Buchungsreferenz ${esc(request.id)} · Erstellt über Conference Manager</footer>
      <script>setTimeout(function(){window.print();},500)<\/script>
    </body></html>`);
    win.document.close();
  }

  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-request-detail]');
    if (btn) {
      e.preventDefault();
      openModal(btn.dataset.requestDetail);
    }
  });

  document.addEventListener('DOMContentLoaded', function () {
    injectStyles();
    ensureModal();
    watchRequestList();
  });
})();
