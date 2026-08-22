const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });

const rooms = [
  { id:'BER-321', location:'Berlin', name:'Berlin · Raum 3.21', capacity:12, equipment:'Teams Room · Display · Whiteboard', rate:80 },
  { id:'BER-412', location:'Berlin', name:'Berlin · Conference Room 4.12', capacity:20, equipment:'Teams Room · Dual Display · Whiteboard', rate:120 },
  { id:'BER-AUD', location:'Berlin', name:'Berlin · Auditorium', capacity:80, equipment:'Stage · PA · Hybrid Setup', rate:320 },
  { id:'STR-201', location:'Stuttgart', name:'Stuttgart · Raum 2.01', capacity:10, equipment:'Teams Room · Display', rate:70 },
  { id:'STR-ATR', location:'Stuttgart', name:'Stuttgart · Atrium', capacity:50, equipment:'PA · Mobile Display · Stage', rate:250 },
  { id:'FRA-105', location:'Frankfurt', name:'Frankfurt · Raum 1.05', capacity:18, equipment:'Teams Room · Display · Whiteboard', rate:100 },
];

const services = [
  { id:'host', name:'Empfang / Host', desc:'Gästebegrüßung und Veranstaltungsbetreuung', price:90 },
  { id:'av', name:'Veranstaltungstechnik', desc:'Technische Betreuung für hybride Meetings', price:160 },
  { id:'it', name:'IT-Support', desc:'On-site Support für Meeting- und Präsentationstechnik', price:140 },
  { id:'service', name:'Servicepersonal', desc:'Betreuung von Catering und Raum während der Veranstaltung', price:120 },
];

const packages = [
  { id:'basic', name:'Basic Meeting', desc:'Kaffee · Tee · Wasser', pricePerPerson:8.5 },
  { id:'breakfast', name:'Breakfast', desc:'Kaffee · Tee · Wasser · Gebäck · Obst', pricePerPerson:14.5 },
  { id:'lunch', name:'Lunch', desc:'Getränke · Sandwiches · Salat · Dessert', pricePerPerson:24 },
  { id:'full', name:'Full Day', desc:'Breakfast · Lunch · Nachmittagssnack', pricePerPerson:39 },
];

const items = [
  { id:'water', name:'Mineralwasser', unit:'Flasche', price:2.5 },
  { id:'coffee', name:'Kaffee', unit:'Person', price:3 },
  { id:'fruit', name:'Obstplatte', unit:'für 10 Personen', price:18 },
  { id:'pretzel', name:'Brezel', unit:'Stück', price:2.2 },
  { id:'sandwich', name:'Sandwich', unit:'Stück', price:6.5 },
  { id:'cake', name:'Kuchen', unit:'Stück', price:4 },
];

const state = {
  step: 1,
  roomId: null,
  serviceIds: [],
  packageId: null,
  quantities: Object.fromEntries(items.map(i => [i.id,0])),
  allocations: [{ costCenter:'471100', percent:100 }],
};

const qs = id => document.getElementById(id);

function init() {
  const tomorrow = new Date(Date.now()+86400000);
  qs('date').value = tomorrow.toISOString().slice(0,10);
  renderServices(); renderPackages(); renderItems(); renderAllocations(); renderRooms(); bind(); updateStep(); renderRequests(); renderManager();
}

function bind() {
  document.querySelectorAll('.nav-item').forEach(btn => btn.addEventListener('click', () => switchView(btn.dataset.view)));
  document.querySelectorAll('.step').forEach(btn => btn.addEventListener('click', () => {
    const target = Number(btn.dataset.step);
    if (target <= state.step || validateStep(state.step)) { state.step = target; updateStep(); }
  }));
  qs('nextBtn').addEventListener('click', () => { if (!validateStep(state.step)) return; if (state.step < 6) state.step++; updateStep(); });
  qs('backBtn').addEventListener('click', () => { if (state.step > 1) state.step--; updateStep(); });
  qs('refreshRooms').addEventListener('click', renderRooms);
  qs('addAllocation').addEventListener('click', () => { state.allocations.push({costCenter:'', percent:0}); renderAllocations(); });
  qs('submitBtn').addEventListener('click', submitRequest);
  ['participants','location','date','start','end','title'].forEach(id => qs(id).addEventListener('change', () => {
    if (['location','participants','date','start','end'].includes(id)) {
      if (state.roomId && !isSelectedRoomStillCandidate()) state.roomId = null;
      renderRooms();
    }
    updateCosts();
  }));
}

function switchView(view) {
  document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  qs('employeeView').classList.toggle('hidden', view !== 'employee');
  qs('requestsView').classList.toggle('hidden', view !== 'requests');
  qs('managerView').classList.toggle('hidden', view !== 'manager');
  const titles = {
    employee:['Neue Konferenzanfrage','Raum, Services und Bewirtung in einer Anfrage.'],
    requests:['Meine Anfragen','Status und Details deiner Konferenzanfragen.'],
    manager:['Manager Cockpit','Manuelle Freigabe und verbindliche Buchung.']
  };
  qs('viewTitle').textContent = titles[view][0];
  qs('viewSubtitle').textContent = titles[view][1];
  if (view === 'requests') renderRequests();
  if (view === 'manager') renderManager();
}

function updateStep() {
  document.querySelectorAll('.step').forEach(btn => {
    const s = Number(btn.dataset.step);
    btn.classList.toggle('active', s === state.step);
    btn.classList.toggle('done', s < state.step);
  });
  document.querySelectorAll('.step-panel').forEach(p => p.classList.toggle('active', Number(p.dataset.panel) === state.step));
  qs('backBtn').classList.toggle('hidden', state.step === 1);
  qs('nextBtn').classList.toggle('hidden', state.step === 6);
  qs('submitBtn').classList.toggle('hidden', state.step !== 6);
  if (state.step === 2) renderRooms();
  if (state.step === 5) updateCosts();
  if (state.step === 6) renderReview();
}

function validateStep(step) {
  if (step === 1) {
    if (!qs('title').value.trim() || !qs('date').value || !qs('start').value || !qs('end').value || Number(qs('participants').value) < 1) { toast('Bitte Terminangaben vollständig ausfüllen.'); return false; }
    if (qs('end').value <= qs('start').value) { toast('Die Endzeit muss nach der Startzeit liegen.'); return false; }
  }
  if (step === 2 && !state.roomId) { toast('Bitte einen verfügbaren Raum auswählen.'); return false; }
  if (step === 5) {
    const total = state.allocations.reduce((a,b)=>a+Number(b.percent||0),0);
    if (Math.abs(total - 100) > 0.01) { toast('Die Kostenanteile müssen zusammen 100 % ergeben.'); return false; }
    if (state.allocations.some(a => !a.costCenter.trim())) { toast('Bitte alle Kostenstellen ausfüllen.'); return false; }
  }
  return true;
}

function mockCalendarBusy(roomId) {
  const local = JSON.parse(localStorage.getItem('conference_requests') || '[]');
  const date = qs('date').value, start = qs('start').value, end = qs('end').value;
  return local.some(r => r.roomId === roomId && r.date === date && !['Rejected','Cancelled'].includes(r.status) && overlaps(start,end,r.start,r.end));
}

function overlaps(aStart,aEnd,bStart,bEnd) { return aStart < bEnd && bStart < aEnd; }

function renderRooms() {
  const location = qs('location').value;
  const participants = Number(qs('participants').value || 0);
  const candidateRooms = rooms.filter(r => r.location === location && r.capacity >= participants);
  const container = qs('rooms');
  if (!candidateRooms.length) { container.innerHTML = '<div class="info-box">Kein Raum erfüllt aktuell Standort und Kapazität.</div>'; return; }
  container.innerHTML = candidateRooms.map(r => {
    const busy = mockCalendarBusy(r.id);
    return `<div class="option-card ${busy ? '' : 'selectable'} ${state.roomId===r.id?'selected':''}" data-room="${r.id}">
      <span class="badge ${busy?'danger':'success'}">${busy?'Belegt':'Verfügbar'}</span>
      <h3>${r.name}</h3><p>${r.capacity} Personen</p><p>${r.equipment}</p><div class="price">${euro.format(r.rate)} · Raumkosten</div>
    </div>`;
  }).join('');
  container.querySelectorAll('[data-room]').forEach(el => el.addEventListener('click', () => {
    if (mockCalendarBusy(el.dataset.room)) { toast('Dieser Raum ist inzwischen belegt.'); return; }
    state.roomId = el.dataset.room; renderRooms(); updateCosts();
  }));
}

function isSelectedRoomStillCandidate() {
  const r = rooms.find(r => r.id === state.roomId);
  return r && r.location === qs('location').value && r.capacity >= Number(qs('participants').value || 0);
}

function renderServices() {
  qs('services').innerHTML = services.map(s => `<div class="option-card selectable ${state.serviceIds.includes(s.id)?'selected':''}" data-service="${s.id}"><h3>${s.name}</h3><p>${s.desc}</p><div class="price">${euro.format(s.price)}</div></div>`).join('');
  qs('services').querySelectorAll('[data-service]').forEach(el => el.addEventListener('click', () => {
    const id = el.dataset.service;
    state.serviceIds = state.serviceIds.includes(id) ? state.serviceIds.filter(x=>x!==id) : [...state.serviceIds,id];
    renderServices(); updateCosts();
  }));
}

function renderPackages() {
  qs('packages').innerHTML = packages.map(p => `<div class="option-card selectable ${state.packageId===p.id?'selected':''}" data-package="${p.id}"><span class="badge neutral">${euro.format(p.pricePerPerson)} / Person</span><h3>${p.name}</h3><p>${p.desc}</p><div class="price">bei ${Number(qs('participants')?.value||12)} Personen: ${euro.format(p.pricePerPerson*Number(qs('participants')?.value||12))}</div></div>`).join('');
  qs('packages').querySelectorAll('[data-package]').forEach(el => el.addEventListener('click', () => { state.packageId = state.packageId === el.dataset.package ? null : el.dataset.package; renderPackages(); updateCosts(); }));
}

function renderItems() {
  qs('cateringItems').innerHTML = items.map(i => `<div class="item-row"><div><strong>${i.name}</strong><small>${euro.format(i.price)} / ${i.unit}</small></div><div class="qty-control"><button data-dec="${i.id}">−</button><strong>${state.quantities[i.id]}</strong><button data-inc="${i.id}">+</button></div><strong>${euro.format(state.quantities[i.id]*i.price)}</strong></div>`).join('');
  qs('cateringItems').querySelectorAll('[data-inc]').forEach(b => b.addEventListener('click', () => { state.quantities[b.dataset.inc]++; renderItems(); updateCosts(); }));
  qs('cateringItems').querySelectorAll('[data-dec]').forEach(b => b.addEventListener('click', () => { state.quantities[b.dataset.dec] = Math.max(0,state.quantities[b.dataset.dec]-1); renderItems(); updateCosts(); }));
}

function costs() {
  const room = rooms.find(r => r.id===state.roomId);
  const roomCost = room?.rate || 0;
  const serviceCost = services.filter(s=>state.serviceIds.includes(s.id)).reduce((a,b)=>a+b.price,0);
  const pkg = packages.find(p=>p.id===state.packageId);
  const packageCost = pkg ? pkg.pricePerPerson*Number(qs('participants').value||0) : 0;
  const itemCost = items.reduce((sum,i)=>sum + i.price*state.quantities[i.id],0);
  return {roomCost, serviceCost, cateringCost:packageCost+itemCost, total:roomCost+serviceCost+packageCost+itemCost};
}

function updateCosts() {
  const c = costs();
  qs('roomCost').textContent = euro.format(c.roomCost);
  qs('serviceCost').textContent = euro.format(c.serviceCost);
  qs('cateringCost').textContent = euro.format(c.cateringCost);
  qs('totalCost').textContent = euro.format(c.total);
  renderAllocations(); renderPackages();
}

function renderAllocations() {
  const c = costs();
  qs('allocations').innerHTML = state.allocations.map((a,idx) => `<div class="allocation-row"><input data-cc="${idx}" value="${a.costCenter}" placeholder="Kostenstelle" /><input data-pct="${idx}" type="number" min="0" max="100" step="1" value="${a.percent}" /><input class="amount" value="${euro.format(c.total*(Number(a.percent||0)/100))}" disabled /><button class="icon-btn" data-remove="${idx}">×</button></div>`).join('');
  qs('allocations').querySelectorAll('[data-cc]').forEach(i => i.addEventListener('input', () => state.allocations[Number(i.dataset.cc)].costCenter=i.value));
  qs('allocations').querySelectorAll('[data-pct]').forEach(i => i.addEventListener('input', () => { state.allocations[Number(i.dataset.pct)].percent=Number(i.value||0); renderAllocations(); }));
  qs('allocations').querySelectorAll('[data-remove]').forEach(b => b.addEventListener('click', () => { if (state.allocations.length===1) return; state.allocations.splice(Number(b.dataset.remove),1); renderAllocations(); }));
  const totalPct = state.allocations.reduce((a,b)=>a+Number(b.percent||0),0);
  qs('allocationStatus').textContent = `Summe: ${totalPct.toFixed(0)} %`;
  qs('allocationStatus').className = 'validation-line ' + (Math.abs(totalPct-100)<0.01?'ok':'bad');
}

function renderReview() {
  const room = rooms.find(r=>r.id===state.roomId);
  const selectedServices = services.filter(s=>state.serviceIds.includes(s.id));
  const pkg = packages.find(p=>p.id===state.packageId);
  const selectedItems = items.filter(i=>state.quantities[i.id]>0);
  const c = costs();
  qs('review').innerHTML = `<div class="review-grid"><div class="review-card"><h3>Termin</h3><p><strong>${escapeHtml(qs('title').value)}</strong></p><p>${fmtDate(qs('date').value)} · ${qs('start').value}–${qs('end').value}</p><p>${qs('participants').value} Teilnehmer · ${qs('location').value}</p></div><div class="review-card"><h3>Raum</h3><p><strong>${room?.name||'—'}</strong></p><p>${room?.equipment||''}</p></div><div class="review-card"><h3>Services</h3><p>${selectedServices.length ? selectedServices.map(s=>s.name).join(' · ') : 'Keine zusätzlichen Services'}</p></div><div class="review-card"><h3>Bewirtung</h3><p>${pkg ? pkg.name : 'Kein Paket'}</p><p>${selectedItems.length ? selectedItems.map(i=>`${state.quantities[i.id]}× ${i.name}`).join(' · ') : 'Keine Einzeloptionen'}</p></div><div class="review-card"><h3>Kostenverteilung</h3>${state.allocations.map(a=>`<p>${escapeHtml(a.costCenter)} · ${a.percent}%</p>`).join('')}</div><div class="review-card"><h3>Gesamtkosten</h3><p style="font-size:24px"><strong>${euro.format(c.total)}</strong></p><p>Geschätzte interne Kosten</p></div></div>`;
}

function submitRequest() {
  if (!validateStep(5) || !state.roomId) return;
  if (mockCalendarBusy(state.roomId)) { toast('Raum wurde zwischenzeitlich gebucht. Bitte einen anderen Raum wählen.'); state.step=2; state.roomId=null; updateStep(); return; }
  const c = costs();
  const request = {
    id: 'CR-' + new Date().getFullYear() + '-' + String(Date.now()).slice(-5),
    title: qs('title').value.trim(), location: qs('location').value, date: qs('date').value, start: qs('start').value, end: qs('end').value,
    participants: Number(qs('participants').value), externalGuests: qs('externalGuests').checked, roomId: state.roomId, serviceIds: [...state.serviceIds],
    packageId: state.packageId, quantities: {...state.quantities}, allocations: JSON.parse(JSON.stringify(state.allocations)), estimatedCost: c.total,
    status: 'Submitted', calendarStatus: 'Tentative', createdAt: new Date().toISOString()
  };
  const requests = JSON.parse(localStorage.getItem('conference_requests') || '[]');
  requests.unshift(request); localStorage.setItem('conference_requests', JSON.stringify(requests));
  toast(`Anfrage ${request.id} erstellt · Raum tentative reserviert.`); resetForm(); switchView('requests');
}

function resetForm() {
  state.step=1; state.roomId=null; state.serviceIds=[]; state.packageId=null;
  state.quantities=Object.fromEntries(items.map(i=>[i.id,0])); state.allocations=[{costCenter:'471100',percent:100}];
  qs('title').value=''; renderServices(); renderPackages(); renderItems(); renderAllocations(); updateStep();
}

function renderRequests() {
  const requests = JSON.parse(localStorage.getItem('conference_requests') || '[]');
  qs('requestList').innerHTML = requests.length ? requests.map(requestCard).join('') : '<div class="info-box">Noch keine Anfragen vorhanden.</div>';
}

function requestCard(r, manager=false) {
  const room = rooms.find(x=>x.id===r.roomId);
  return `<div class="request-card"><div class="request-top"><div><h3>${escapeHtml(r.title)}</h3><div class="request-meta">${r.id} · ${fmtDate(r.date)} · ${r.start}–${r.end}</div></div><span class="badge ${statusBadge(r.status)}">${statusLabel(r.status)}</span></div><div class="request-grid"><div><small>Raum</small><strong>${room?.name||'—'}</strong></div><div><small>Teilnehmer</small><strong>${r.participants}</strong></div><div><small>Kalender</small><strong>${r.calendarStatus}</strong></div><div><small>Kosten</small><strong>${euro.format(r.estimatedCost)}</strong></div></div>${manager && ['Submitted','In Review'].includes(r.status) ? `<div class="request-actions"><button class="primary success" onclick="managerAction('${r.id}','confirm')">Bestätigen</button><button class="secondary" onclick="managerAction('${r.id}','change')">Änderung anfordern</button><button class="danger-btn" onclick="managerAction('${r.id}','reject')">Ablehnen</button></div>`:''}</div>`;
}

function renderManager() {
  const requests = JSON.parse(localStorage.getItem('conference_requests') || '[]');
  qs('managerList').innerHTML = requests.length ? requests.map(r=>requestCard(r,true)).join('') : '<div class="info-box">Keine Anfragen zur Prüfung.</div>';
  qs('statOpen').textContent = requests.filter(r=>['Submitted','In Review'].includes(r.status)).length;
  qs('statTentative').textContent = requests.filter(r=>r.calendarStatus==='Tentative').length;
  qs('statConfirmed').textContent = requests.filter(r=>r.status==='Confirmed').length;
  qs('statConflicts').textContent = '0';
}

window.managerAction = function(id, action) {
  const requests = JSON.parse(localStorage.getItem('conference_requests') || '[]');
  const r = requests.find(x=>x.id===id); if (!r) return;
  if (action==='confirm') { r.status='Confirmed'; r.calendarStatus='Busy'; toast(`${id} bestätigt · Kalenderbuchung verbindlich.`); }
  if (action==='reject') { r.status='Rejected'; r.calendarStatus='Released'; toast(`${id} abgelehnt · Tentative Reservierung freigegeben.`); }
  if (action==='change') { r.status='Change Requested'; r.calendarStatus='Tentative'; toast(`${id}: Änderung angefordert.`); }
  localStorage.setItem('conference_requests', JSON.stringify(requests)); renderManager(); renderRequests();
}

function statusLabel(s) { return ({Submitted:'Zur Prüfung',Confirmed:'Bestätigt',Rejected:'Abgelehnt','Change Requested':'Änderung angefordert'})[s] || s; }
function statusBadge(s) { return ({Submitted:'warning',Confirmed:'success',Rejected:'danger','Change Requested':'neutral'})[s] || 'neutral'; }
function fmtDate(d) { if(!d) return ''; return new Date(d+'T12:00:00').toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit',year:'numeric'}); }
function toast(msg) { const el=qs('toast'); el.textContent=msg; el.classList.add('show'); clearTimeout(window.__toast); window.__toast=setTimeout(()=>el.classList.remove('show'),3200); }
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c])); }

init();
