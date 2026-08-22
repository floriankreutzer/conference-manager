const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
const qs = id => document.getElementById(id);
const on = (id, event, handler) => { const el = qs(id); if (el) el.addEventListener(event, handler); };
const BUILD_VERSION = '2026.08.22.2';

const rooms = [
  {id:'BER-321',location:'Berlin',name:'Berlin · Raum 3.21',capacity:12,equipment:'Teams Room · Display · Whiteboard',rate:80},
  {id:'BER-412',location:'Berlin',name:'Berlin · Conference Room 4.12',capacity:20,equipment:'Teams Room · Dual Display · Whiteboard',rate:120},
  {id:'BER-AUD',location:'Berlin',name:'Berlin · Auditorium',capacity:80,equipment:'Stage · PA · Hybrid Setup',rate:320},
  {id:'STR-201',location:'Stuttgart',name:'Stuttgart · Raum 2.01',capacity:10,equipment:'Teams Room · Display',rate:70},
  {id:'STR-ATR',location:'Stuttgart',name:'Stuttgart · Atrium',capacity:50,equipment:'PA · Mobile Display · Stage',rate:250},
  {id:'FRA-105',location:'Frankfurt',name:'Frankfurt · Raum 1.05',capacity:18,equipment:'Teams Room · Display · Whiteboard',rate:100}
];
const services = [
  {id:'host',name:'Empfang / Host',desc:'Gästebegrüßung und Veranstaltungsbetreuung',price:90},
  {id:'av',name:'Veranstaltungstechnik',desc:'Technische Betreuung für hybride Meetings',price:160},
  {id:'it',name:'IT-Support',desc:'On-site Support für Meeting- und Präsentationstechnik',price:140},
  {id:'service',name:'Servicepersonal',desc:'Betreuung von Catering und Raum während der Veranstaltung',price:120}
];
const packages = [
  {id:'basic',name:'Basic Meeting',desc:'Kaffee · Tee · Wasser',pricePerPerson:8.5},
  {id:'breakfast',name:'Breakfast',desc:'Kaffee · Tee · Wasser · Gebäck · Obst',pricePerPerson:14.5},
  {id:'lunch',name:'Lunch',desc:'Getränke · Sandwiches · Salat · Dessert',pricePerPerson:24},
  {id:'full',name:'Full Day',desc:'Breakfast · Lunch · Nachmittagssnack',pricePerPerson:39}
];
const items = [
  {id:'water',name:'Mineralwasser',unit:'Flasche',price:2.5},{id:'coffee',name:'Kaffee',unit:'Person',price:3},
  {id:'fruit',name:'Obstplatte',unit:'für 10 Personen',price:18},{id:'pretzel',name:'Brezel',unit:'Stück',price:2.2},
  {id:'sandwich',name:'Sandwich',unit:'Stück',price:6.5},{id:'cake',name:'Kuchen',unit:'Stück',price:4}
];
const state = {step:1,roomId:null,serviceIds:[],packageId:null,quantities:Object.fromEntries(items.map(i=>[i.id,0])),allocations:[{costCenter:'471100',percent:100}]};

function totalParticipants(){return Number(qs('internalParticipants')?.value||0)+Number(qs('externalParticipants')?.value||0)}
function updateParticipantTotal(){if(qs('participantTotal'))qs('participantTotal').textContent=`${totalParticipants()} Teilnehmende`}
function getRequests(){try{return JSON.parse(localStorage.getItem('conference_requests')||'[]')}catch{return []}}
function saveRequests(v){localStorage.setItem('conference_requests',JSON.stringify(v))}
function overlaps(a,b,c,d){return a<d&&c<b}
function mockCalendarBusy(roomId){const date=qs('date')?.value||'',start=qs('start')?.value||'',end=qs('end')?.value||'';return getRequests().some(r=>r.roomId===roomId&&r.date===date&&!['Rejected','Cancelled'].includes(r.status)&&overlaps(start,end,r.start,r.end))}

function init(){
  const date=qs('date');
  if(date&&!date.value) date.value=new Date(Date.now()+86400000).toISOString().slice(0,10);
  bind();
  updateParticipantTotal();
  renderServices(); renderPackages(); renderItems(); renderAllocations(); renderRooms(); updateStep(); renderRequests(); renderManager();
  document.documentElement.dataset.appReady='true';
  console.info(`Conference Manager ${BUILD_VERSION} ready`);
}
function bind(){
  document.querySelectorAll('.nav-item').forEach(b=>b.addEventListener('click',()=>switchView(b.dataset.view)));
  document.querySelectorAll('.step').forEach(b=>b.addEventListener('click',()=>{const t=Number(b.dataset.step);if(t<=state.step||validateStep(state.step)){state.step=t;updateStep()}}));
  on('nextBtn','click',()=>{if(validateStep(state.step)&&state.step<6){state.step++;updateStep()}});
  on('backBtn','click',()=>{if(state.step>1){state.step--;updateStep()}});
  on('refreshRooms','click',renderRooms);
  on('addAllocation','click',()=>{state.allocations.push({costCenter:'',percent:0});renderAllocations()});
  on('submitBtn','click',submitRequest);
  ['internalParticipants','externalParticipants','location','date','start','end','title'].forEach(id=>{
    const el=qs(id); if(!el) return;
    el.addEventListener('change',()=>{
      if(['internalParticipants','externalParticipants'].includes(id))updateParticipantTotal();
      if(['location','internalParticipants','externalParticipants','date','start','end'].includes(id)){if(state.roomId&&!isSelectedRoomStillCandidate())state.roomId=null;renderRooms()}
      updateCosts();
    });
  });
  document.addEventListener('click',e=>{
    const cancel=e.target.closest?.('[data-cancel-request]'); if(cancel) window.cancelRequest(cancel.dataset.cancelRequest);
    const action=e.target.closest?.('[data-manager-action]'); if(action) window.managerAction(action.dataset.requestId,action.dataset.managerAction);
  });
}
function switchView(view){
  document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
  qs('employeeView')?.classList.toggle('hidden',view!=='employee'); qs('requestsView')?.classList.toggle('hidden',view!=='requests'); qs('managerView')?.classList.toggle('hidden',view!=='manager');
  const t={employee:['Neue Konferenzanfrage','Raum, Services und Bewirtung in einer Anfrage.'],requests:['Meine Anfragen','Status und Details deiner Konferenzanfragen.'],manager:['Manager Cockpit','Manuelle Freigabe und verbindliche Buchung.']}[view];
  if(!t)return; if(qs('viewTitle'))qs('viewTitle').textContent=t[0];if(qs('viewSubtitle'))qs('viewSubtitle').textContent=t[1]; if(view==='requests')renderRequests();if(view==='manager')renderManager();
}
function updateStep(){
  document.querySelectorAll('.step').forEach(b=>{const s=Number(b.dataset.step);b.classList.toggle('active',s===state.step);b.classList.toggle('done',s<state.step)});
  document.querySelectorAll('.step-panel').forEach(p=>p.classList.toggle('active',Number(p.dataset.panel)===state.step));
  qs('backBtn')?.classList.toggle('hidden',state.step===1);qs('nextBtn')?.classList.toggle('hidden',state.step===6);qs('submitBtn')?.classList.toggle('hidden',state.step!==6);
  if(state.step===2)renderRooms();if(state.step===5)updateCosts();if(state.step===6)renderReview();
}
function validateStep(step){
  if(step===1){const i=Number(qs('internalParticipants')?.value||0),e=Number(qs('externalParticipants')?.value||0);if(i<0||e<0){toast('Teilnehmerzahlen dürfen nicht negativ sein.');return false}if(!qs('title')?.value.trim()||!qs('date')?.value||!qs('start')?.value||!qs('end')?.value||totalParticipants()<1){toast('Bitte Terminangaben vollständig ausfüllen.');return false}if(qs('end').value<=qs('start').value){toast('Die Endzeit muss nach der Startzeit liegen.');return false}}
  if(step===2&&!state.roomId){toast('Bitte einen verfügbaren Raum auswählen.');return false}
  if(step===5){const sum=state.allocations.reduce((a,b)=>a+Number(b.percent||0),0);if(Math.abs(sum-100)>.01){toast('Die Kostenanteile müssen zusammen 100 % ergeben.');return false}if(state.allocations.some(a=>!a.costCenter.trim())){toast('Bitte alle Kostenstellen ausfüllen.');return false}}
  return true;
}
function renderRooms(){
  const host=qs('rooms'); if(!host)return;
  const location=qs('location')?.value||''; const candidates=rooms.filter(r=>r.location===location&&r.capacity>=totalParticipants());
  host.innerHTML=candidates.length?candidates.map(r=>`<div class="option-card ${mockCalendarBusy(r.id)?'':'selectable'} ${state.roomId===r.id?'selected':''}" data-room="${r.id}"><span class="badge ${mockCalendarBusy(r.id)?'danger':'success'}">${mockCalendarBusy(r.id)?'Belegt':'Verfügbar'}</span><h3>${r.name}</h3><p>${r.capacity} Personen</p><p>${r.equipment}</p><div class="price">${euro.format(r.rate)} · Raumkosten</div></div>`).join(''):'<div class="info-box">Kein Raum erfüllt aktuell Standort und Kapazität.</div>';
  host.querySelectorAll('[data-room]').forEach(el=>el.onclick=()=>{if(mockCalendarBusy(el.dataset.room)){toast('Dieser Raum ist inzwischen belegt.');return}state.roomId=el.dataset.room;renderRooms();updateCosts()});
}
function isSelectedRoomStillCandidate(){const r=rooms.find(x=>x.id===state.roomId);return r&&r.location===(qs('location')?.value||'')&&r.capacity>=totalParticipants()}
function renderServices(){const host=qs('services');if(!host)return;host.innerHTML=services.map(s=>`<div class="option-card selectable ${state.serviceIds.includes(s.id)?'selected':''}" data-service="${s.id}"><h3>${s.name}</h3><p>${s.desc}</p><div class="price">${euro.format(s.price)}</div></div>`).join('');host.querySelectorAll('[data-service]').forEach(el=>el.onclick=()=>{const id=el.dataset.service;state.serviceIds=state.serviceIds.includes(id)?state.serviceIds.filter(x=>x!==id):[...state.serviceIds,id];renderServices();updateCosts()})}
function renderPackages(){const host=qs('packages');if(!host)return;host.innerHTML=packages.map(p=>`<div class="option-card selectable ${state.packageId===p.id?'selected':''}" data-package="${p.id}"><span class="badge neutral">${euro.format(p.pricePerPerson)} / Person</span><h3>${p.name}</h3><p>${p.desc}</p><div class="price">bei ${totalParticipants()} Personen: ${euro.format(p.pricePerPerson*totalParticipants())}</div></div>`).join('');host.querySelectorAll('[data-package]').forEach(el=>el.onclick=()=>{state.packageId=state.packageId===el.dataset.package?null:el.dataset.package;renderPackages();updateCosts()})}
function renderItems(){const host=qs('cateringItems');if(!host)return;host.innerHTML=items.map(i=>`<div class="item-row"><div><strong>${i.name}</strong><small>${euro.format(i.price)} / ${i.unit}</small></div><div class="qty-control"><button type="button" data-dec="${i.id}">−</button><strong>${state.quantities[i.id]}</strong><button type="button" data-inc="${i.id}">+</button></div><strong>${euro.format(state.quantities[i.id]*i.price)}</strong></div>`).join('');host.querySelectorAll('[data-inc]').forEach(b=>b.onclick=()=>{state.quantities[b.dataset.inc]++;renderItems();updateCosts()});host.querySelectorAll('[data-dec]').forEach(b=>b.onclick=()=>{state.quantities[b.dataset.dec]=Math.max(0,state.quantities[b.dataset.dec]-1);renderItems();updateCosts()})}
function costs(){const roomCost=rooms.find(r=>r.id===state.roomId)?.rate||0,serviceCost=services.filter(s=>state.serviceIds.includes(s.id)).reduce((a,b)=>a+b.price,0),pkg=packages.find(p=>p.id===state.packageId),packageCost=pkg?pkg.pricePerPerson*totalParticipants():0,itemCost=items.reduce((a,i)=>a+i.price*state.quantities[i.id],0);return{roomCost,serviceCost,cateringCost:packageCost+itemCost,total:roomCost+serviceCost+packageCost+itemCost}}
function updateCosts(){const c=costs();if(qs('roomCost'))qs('roomCost').textContent=euro.format(c.roomCost);if(qs('serviceCost'))qs('serviceCost').textContent=euro.format(c.serviceCost);if(qs('cateringCost'))qs('cateringCost').textContent=euro.format(c.cateringCost);if(qs('totalCost'))qs('totalCost').textContent=euro.format(c.total);renderAllocations();renderPackages()}
function renderAllocations(){const host=qs('allocations');if(!host)return;const c=costs();host.innerHTML=state.allocations.map((a,n)=>`<div class="allocation-row"><input data-cc="${n}" value="${escapeHtml(a.costCenter)}" placeholder="Kostenstelle"/><input data-pct="${n}" type="number" min="0" max="100" value="${a.percent}"/><input class="amount" value="${euro.format(c.total*(Number(a.percent||0)/100))}" disabled/><button type="button" class="icon-btn" data-remove="${n}">×</button></div>`).join('');host.querySelectorAll('[data-cc]').forEach(i=>i.oninput=()=>state.allocations[Number(i.dataset.cc)].costCenter=i.value);host.querySelectorAll('[data-pct]').forEach(i=>i.oninput=()=>{state.allocations[Number(i.dataset.pct)].percent=Number(i.value||0);renderAllocations()});host.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{if(state.allocations.length>1){state.allocations.splice(Number(b.dataset.remove),1);renderAllocations()}});const sum=state.allocations.reduce((a,b)=>a+Number(b.percent||0),0);if(qs('allocationStatus')){qs('allocationStatus').textContent=`Summe: ${sum.toFixed(0)} %`;qs('allocationStatus').className='validation-line '+(Math.abs(sum-100)<.01?'ok':'bad')}}
function renderReview(){const host=qs('review');if(!host)return;const room=rooms.find(r=>r.id===state.roomId),ss=services.filter(s=>state.serviceIds.includes(s.id)),pkg=packages.find(p=>p.id===state.packageId),si=items.filter(i=>state.quantities[i.id]>0),c=costs();host.innerHTML=`<div class="review-grid"><div class="review-card"><h3>Termin</h3><p><strong>${escapeHtml(qs('title')?.value||'')}</strong></p><p>${fmtDate(qs('date')?.value||'')} · ${qs('start')?.value||''}–${qs('end')?.value||''}</p><p>${totalParticipants()} Teilnehmende · ${qs('location')?.value||''}</p><p>${Number(qs('internalParticipants')?.value||0)} intern · ${Number(qs('externalParticipants')?.value||0)} extern</p></div><div class="review-card"><h3>Raum</h3><p><strong>${room?.name||'—'}</strong></p><p>${room?.equipment||''}</p></div><div class="review-card"><h3>Services</h3><p>${ss.length?ss.map(s=>s.name).join(' · '):'Keine zusätzlichen Services'}</p></div><div class="review-card"><h3>Bewirtung</h3><p>${pkg?pkg.name:'Kein Paket'}</p><p>${si.length?si.map(i=>`${state.quantities[i.id]}× ${i.name}`).join(' · '):'Keine Einzeloptionen'}</p></div><div class="review-card"><h3>Kostenverteilung</h3>${state.allocations.map(a=>`<p>${escapeHtml(a.costCenter)} · ${a.percent}%</p>`).join('')}</div><div class="review-card"><h3>Gesamtkosten</h3><p style="font-size:24px"><strong>${euro.format(c.total)}</strong></p><p>Geschätzte interne Kosten</p></div></div>`}
function submitRequest(){
  if(!validateStep(5)||!state.roomId)return;if(mockCalendarBusy(state.roomId)){toast('Raum wurde zwischenzeitlich gebucht. Bitte einen anderen Raum wählen.');state.step=2;state.roomId=null;updateStep();return}
  const c=costs(),request={id:'CR-'+new Date().getFullYear()+'-'+String(Date.now()).slice(-5),title:qs('title')?.value.trim()||'',location:qs('location')?.value||'',date:qs('date')?.value||'',start:qs('start')?.value||'',end:qs('end')?.value||'',participants:totalParticipants(),internalParticipants:Number(qs('internalParticipants')?.value||0),externalParticipants:Number(qs('externalParticipants')?.value||0),roomId:state.roomId,serviceIds:[...state.serviceIds],packageId:state.packageId,quantities:{...state.quantities},allocations:JSON.parse(JSON.stringify(state.allocations)),estimatedCost:c.total,status:'Submitted',calendarStatus:'Tentative',createdAt:new Date().toISOString()};
  const rs=getRequests();rs.unshift(request);saveRequests(rs);toast(`Anfrage ${request.id} erstellt · Raum tentative reserviert.`);resetForm();switchView('requests');
}
function resetForm(){state.step=1;state.roomId=null;state.serviceIds=[];state.packageId=null;state.quantities=Object.fromEntries(items.map(i=>[i.id,0]));state.allocations=[{costCenter:'471100',percent:100}];if(qs('title'))qs('title').value='';if(qs('internalParticipants'))qs('internalParticipants').value=10;if(qs('externalParticipants'))qs('externalParticipants').value=2;updateParticipantTotal();renderServices();renderPackages();renderItems();renderAllocations();updateStep()}
function renderRequests(){const host=qs('requestList');if(!host)return;const rs=getRequests();host.innerHTML=rs.length?rs.map(r=>requestCard(r,false)).join(''):'<div class="info-box">Noch keine Anfragen vorhanden.</div>'}
function requestCard(r,manager=false){const room=rooms.find(x=>x.id===r.roomId),internal=r.internalParticipants??r.participants??0,external=r.externalParticipants??0;return`<div class="request-card ${r.status==='Cancelled'?'cancelled':''}"><div class="request-top"><div><h3>${escapeHtml(r.title)}</h3><div class="request-meta">${r.id} · ${fmtDate(r.date)} · ${r.start}–${r.end}</div></div><span class="badge ${statusBadge(r.status)}">${statusLabel(r.status)}</span></div><div class="request-grid"><div><small>Raum</small><strong>${room?.name||'—'}</strong></div><div><small>Teilnehmende</small><strong>${r.participants??internal+external}</strong></div><div><small>Intern / extern</small><strong>${internal} / ${external}</strong></div><div><small>Kalender</small><strong>${r.calendarStatus||'—'}</strong></div><div><small>Kosten</small><strong>${euro.format(r.estimatedCost||0)}</strong></div></div>${manager&&['Submitted','In Review'].includes(r.status)?`<div class="request-actions"><button type="button" class="primary success" data-manager-action="confirm" data-request-id="${r.id}">Bestätigen</button><button type="button" class="secondary" data-manager-action="change" data-request-id="${r.id}">Änderung anfordern</button><button type="button" class="danger-btn" data-manager-action="reject" data-request-id="${r.id}">Ablehnen</button></div>`:''}${!manager&&['Submitted','Confirmed','Change Requested'].includes(r.status)?`<div class="request-actions"><button type="button" class="danger-btn" data-cancel-request="${r.id}">Anfrage stornieren</button></div>`:''}</div>`}
function renderManager(){const host=qs('managerList');if(!host)return;const rs=getRequests();host.innerHTML=rs.length?rs.map(r=>requestCard(r,true)).join(''):'<div class="info-box">Keine Anfragen zur Prüfung.</div>';if(qs('statOpen'))qs('statOpen').textContent=rs.filter(r=>['Submitted','In Review'].includes(r.status)).length;if(qs('statTentative'))qs('statTentative').textContent=rs.filter(r=>r.calendarStatus==='Tentative').length;if(qs('statConfirmed'))qs('statConfirmed').textContent=rs.filter(r=>r.status==='Confirmed').length;if(qs('statConflicts'))qs('statConflicts').textContent='0'}
window.managerAction=(id,action)=>{const rs=getRequests(),r=rs.find(x=>x.id===id);if(!r)return;if(action==='confirm'){r.status='Confirmed';r.calendarStatus='Busy';toast(`${id} bestätigt · Kalenderbuchung verbindlich.`)}if(action==='reject'){r.status='Rejected';r.calendarStatus='Released';toast(`${id} abgelehnt · Reservierung freigegeben.`)}if(action==='change'){r.status='Change Requested';r.calendarStatus='Tentative';toast(`${id}: Änderung angefordert.`)}saveRequests(rs);renderManager();renderRequests()};
window.cancelRequest=id=>{const rs=getRequests(),r=rs.find(x=>x.id===id);if(!r||!['Submitted','Confirmed','Change Requested'].includes(r.status))return;if(!window.confirm(`Anfrage ${id} wirklich stornieren? Die Raumreservierung wird freigegeben.`))return;r.status='Cancelled';r.calendarStatus='Released';r.cancelledAt=new Date().toISOString();saveRequests(rs);toast(`${id} storniert · Raumreservierung freigegeben.`);renderRequests();renderManager()};
function statusLabel(s){return({Submitted:'Zur Prüfung',Confirmed:'Bestätigt',Rejected:'Abgelehnt','Change Requested':'Änderung angefordert',Cancelled:'Storniert'})[s]||s}
function statusBadge(s){return({Submitted:'warning',Confirmed:'success',Rejected:'danger','Change Requested':'neutral',Cancelled:'neutral'})[s]||'neutral'}
function fmtDate(d){return d?new Date(d+'T12:00:00').toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit',year:'numeric'}):''}
function toast(msg){const el=qs('toast');if(!el)return;el.textContent=msg;el.classList.add('show');clearTimeout(window.__toast);window.__toast=setTimeout(()=>el.classList.remove('show'),3200)}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))}
if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',init,{once:true})}else{init()}
