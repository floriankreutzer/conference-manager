(function () {
  const REQUEST_KEY = 'conference_requests';
  const CATALOG_KEY = 'conference_catalog_v2';
  const SITE_KEY = 'conference_site_info_v1';

  const qs = id => document.getElementById(id);
  const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const euro = new Intl.NumberFormat('de-DE', { style:'currency', currency:'EUR' });

  function getRequests(){try{return JSON.parse(localStorage.getItem(REQUEST_KEY)||'[]')}catch{return[]}}
  function getCatalog(){try{return JSON.parse(localStorage.getItem(CATALOG_KEY)||'null')}catch{return null}}
  function getRequest(id){return getRequests().find(r=>r.id===id)}
  function getRoom(request){return getCatalog()?.rooms?.find(r=>r.id===request.roomId)||null}
  function getSite(location){
    try { if (typeof window.getConferenceSiteInfo === 'function') return window.getConferenceSiteInfo(location); } catch (_) {}
    try {
      const data = JSON.parse(localStorage.getItem(SITE_KEY)||'{}');
      return data?.[location] || {};
    } catch { return {}; }
  }
  function statusLabel(status){return({Submitted:'Zur Prüfung',Confirmed:'Bestätigt',Rejected:'Abgelehnt','Change Requested':'Änderung angefordert',Cancelled:'Storniert'})[status]||status||'—'}
  function fmtDate(d){return d?new Date(d+'T12:00:00').toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit',year:'numeric'}):'—'}
  function safe(value,fallback='Nicht hinterlegt'){return String(value||'').trim()||fallback}

  function injectStyles(){
    if(qs('requestDetailStyles'))return;
    const style=document.createElement('style');style.id='requestDetailStyles';style.textContent=`
      .request-detail-overlay{position:fixed;inset:0;background:rgba(0,0,0,.55);display:none;align-items:center;justify-content:center;z-index:10000;padding:16px}.request-detail-overlay.open{display:flex}
      .request-detail-modal{background:#fff;width:min(1080px,100%);max-height:92vh;overflow:auto;border:1px solid #d0d0ce;box-shadow:0 24px 70px rgba(0,0,0,.25)}
      .request-detail-head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;padding:20px 22px;border-bottom:1px solid #d0d0ce}.request-detail-head h2{margin:0 0 5px;font-size:25px}.request-detail-head p{margin:0;color:#63666a}
      .request-detail-body{padding:20px 22px}.detail-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:18px}.detail-summary>div,.detail-card{border:1px solid #d0d0ce;background:#fafafa;padding:13px}.detail-summary small{display:block;color:#63666a;margin-bottom:4px}.detail-summary strong{display:block;font-size:16px}
      .detail-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.detail-card h3{margin:0 0 10px;border-bottom:3px solid #86bc25;padding-bottom:7px;font-size:17px}.detail-card p{margin:6px 0;color:#53565a;line-height:1.45}.detail-floorplan{width:100%;max-height:260px;object-fit:contain;background:#fff;border:1px solid #d0d0ce;margin-top:8px}
      .detail-actions{display:flex;flex-wrap:wrap;gap:10px;padding:18px 22px;border-top:1px solid #d0d0ce;background:#fafafa}.detail-actions .spacer{flex:1}.detail-site-incomplete{border-left:4px solid #a15c00;background:#fff7e6;padding:10px 12px;margin-top:10px;font-size:13px;color:#6f4700}
      @media(max-width:760px){.detail-summary,.detail-grid{grid-template-columns:1fr}.request-detail-modal{max-height:94vh}}
    `;document.head.appendChild(style)
  }

  function ensureModal(){
    if(qs('requestDetailOverlay'))return;
    const overlay=document.createElement('div');overlay.id='requestDetailOverlay';overlay.className='request-detail-overlay';overlay.innerHTML=`
      <div class="request-detail-modal" role="dialog" aria-modal="true" aria-labelledby="requestDetailTitle">
        <div class="request-detail-head"><div><h2 id="requestDetailTitle">Buchungsdetails</h2><p id="requestDetailSubtitle"></p></div><button type="button" class="secondary" id="closeRequestDetail">Schließen</button></div>
        <div class="request-detail-body" id="requestDetailBody"></div>
        <div class="detail-actions"><button type="button" class="secondary" id="requestDetailFloorplan">Floorplan anzeigen</button><div class="spacer"></div><button type="button" class="primary" id="welcomePdfBtn">Willkommens-PDF erstellen</button></div>
      </div>`;
    document.body.appendChild(overlay);overlay.addEventListener('click',e=>{if(e.target===overlay)closeModal()});qs('closeRequestDetail').addEventListener('click',closeModal);
    qs('welcomePdfBtn').addEventListener('click',()=>{const id=qs('welcomePdfBtn').dataset.requestId;if(id)createWelcomePdf(id)});
    qs('requestDetailFloorplan').addEventListener('click',()=>{const id=qs('requestDetailFloorplan').dataset.roomId;if(!id)return;const btn=qsa('[data-open-floorplan]').find(b=>b.dataset.openFloorplan===id);if(btn)btn.click()});
  }

  function buildServices(request,catalog){const ids=request.serviceIds||[];const list=ids.map(id=>catalog?.services?.find(s=>s.id===id)?.name||id).filter(Boolean);return list.length?list.join(' · '):'Keine zusätzlichen Services'}
  function buildItems(request,catalog){const q=request.quantities||{};const parts=Object.entries(q).filter(([,qty])=>Number(qty)>0).map(([id,qty])=>`${qty}× ${catalog?.cateringItems?.find(i=>i.id===id)?.name||id}`);return parts.length?parts.join(' · '):'Keine Einzeloptionen'}
  function buildAllocations(request){const a=request.allocations||[];return a.length?a.map(x=>`${esc(x.costCenter||'—')} · ${Number(x.percent||0)} %`).join('<br>'):'Keine Kostenverteilung hinterlegt'}
  function siteComplete(s){return ['address','publicTransport','carArrival','parking','reception','building','contact'].every(k=>String(s?.[k]||'').trim())}

  function openModal(id){
    const request=getRequest(id);if(!request)return;ensureModal();const catalog=getCatalog();const room=getRoom(request);const site=getSite(request.location||room?.location||'');
    const internal=request.internalParticipants??request.participants??0,external=request.externalParticipants??0,total=request.participants??(Number(internal)+Number(external));
    const packageText=request.packageSelection?`${request.packageSelection.packageName||request.packageSelection.packageId} · ${request.packageSelection.tier}`:'Kein Catering-Paket';
    qs('requestDetailTitle').textContent=request.title||'Buchungsdetails';qs('requestDetailSubtitle').textContent=`${request.id} · ${statusLabel(request.status)}`;
    qs('requestDetailBody').innerHTML=`
      <div class="detail-summary"><div><small>Datum</small><strong>${fmtDate(request.date)}</strong></div><div><small>Zeit</small><strong>${esc(request.start)}–${esc(request.end)}</strong></div><div><small>Status</small><strong>${esc(statusLabel(request.status))}</strong></div><div><small>Gesamtkosten</small><strong>${euro.format(request.estimatedCost||0)}</strong></div></div>
      <div class="detail-grid">
        <div class="detail-card"><h3>Raum & Standort</h3><p><strong>${esc(room?.name||request.roomId||'—')}</strong></p><p>${esc(request.location||room?.location||'—')} · ${esc(room?.floor||'Etage nicht hinterlegt')}</p><p>${esc(room?.equipment||'Keine Ausstattungsinformationen')}</p>${room?.floorplanImage?`<img class="detail-floorplan" src="${esc(room.floorplanImage)}" alt="Floorplan ${esc(room.name)}">`:''}</div>
        <div class="detail-card"><h3>Teilnehmende</h3><p><strong>${total} Personen</strong></p><p>${internal} intern · ${external} extern</p><p>Kalenderstatus: ${esc(request.calendarStatus||'—')}</p></div>
        <div class="detail-card"><h3>Services</h3><p>${esc(buildServices(request,catalog))}</p></div>
        <div class="detail-card"><h3>Bewirtung</h3><p><strong>${esc(packageText)}</strong></p><p>${esc(buildItems(request,catalog))}</p></div>
        <div class="detail-card"><h3>Kostenverteilung</h3><p>${buildAllocations(request)}</p></div>
        <div class="detail-card"><h3>Gästeinformationen</h3><p><strong>${esc(safe(site.address))}</strong></p><p>Empfang: ${esc(safe(site.reception))}</p><p>Kontakt: ${esc(safe(site.contact))}${site.contactDetails?` · ${esc(site.contactDetails)}`:''}</p>${siteComplete(site)?'':`<div class="detail-site-incomplete">Standortinformationen sind noch nicht vollständig gepflegt. Im Manager Cockpit unter Angebot & Preise → Standorte ergänzen.</div>`}</div>
      </div>`;
    const pdf=qs('welcomePdfBtn');pdf.dataset.requestId=request.id;pdf.disabled=request.status!=='Confirmed';pdf.title=request.status==='Confirmed'?'Willkommens-PDF erstellen':'PDF ist nach Bestätigung der Buchung verfügbar';pdf.style.opacity=request.status==='Confirmed'?'1':'.5';
    const floor=qs('requestDetailFloorplan');floor.dataset.roomId=room?.id||'';floor.disabled=!room?.floorplanImage;floor.style.opacity=room?.floorplanImage?'1':'.5';qs('requestDetailOverlay').classList.add('open')
  }
  function closeModal(){qs('requestDetailOverlay')?.classList.remove('open')}
  function extractRequestId(card){const text=card.querySelector('.request-meta')?.textContent||'';const m=text.match(/CR-\d{4}-\d+/);return m?m[0]:null}
  function decorateRequestCards(){qsa('#requestList .request-card').forEach(card=>{if(card.querySelector('[data-request-detail]'))return;const id=extractRequestId(card);if(!id)return;let actions=card.querySelector('.request-actions');if(!actions){actions=document.createElement('div');actions.className='request-actions';card.appendChild(actions)}const btn=document.createElement('button');btn.type='button';btn.className='secondary';btn.dataset.requestDetail=id;btn.textContent='Details anzeigen';actions.insertBefore(btn,actions.firstChild)})}
  function watchRequestList(){const list=qs('requestList');if(!list||list.__detailObserved)return;const obs=new MutationObserver(decorateRequestCards);obs.observe(list,{childList:true,subtree:true});list.__detailObserved=true;decorateRequestCards()}

  function printValue(value){return esc(safe(value,'Bitte beim Veranstalter erfragen'))}
  function createWelcomePdf(id){
    const request=getRequest(id);if(!request||request.status!=='Confirmed')return;const catalog=getCatalog();const room=getRoom(request);const location=request.location||room?.location||'Standort';const site=getSite(location);
    const total=request.participants??((request.internalParticipants||0)+(request.externalParticipants||0));const external=request.externalParticipants??0;const catering=request.packageSelection?`${request.packageSelection.packageName||request.packageSelection.packageId} - ${request.packageSelection.tier}`:'Keine Bewirtung vorgesehen';const services=buildServices(request,catalog);const floorplan=room?.floorplanImage||'';
    const win=window.open('','_blank');if(!win)return;win.document.open();win.document.write(`<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Willkommen - ${esc(request.title)}</title><style>
      @page{size:A4;margin:14mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#000;margin:0;font-size:11pt;line-height:1.45}header{border-bottom:5px solid #86bc25;padding:0 0 14px;margin-bottom:22px}.brand{font-size:13px;font-weight:700;margin-bottom:16px}h1{font-size:28px;margin:0 0 5px}h2{font-size:16px;margin:0 0 8px;border-bottom:2px solid #86bc25;padding-bottom:5px}p{margin:5px 0}.lead{font-size:14px;color:#53565a}.facts{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin:18px 0}.fact,.section{border:1px solid #d0d0ce;padding:11px}.fact small{display:block;color:#63666a}.fact strong{font-size:13px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px}.section{break-inside:avoid}.floorplan{width:100%;max-height:240px;object-fit:contain;border:1px solid #d0d0ce;margin-top:8px}.note{border-left:5px solid #86bc25;background:#f5f5f5;padding:10px 12px;margin-top:14px}.incomplete{border-left-color:#a15c00;background:#fff7e6}.print-btn{border:1px solid #000;background:#000;color:#fff;padding:10px 14px;font-weight:700;margin-bottom:14px}@media print{.print-btn{display:none}}@media(max-width:600px){.grid,.facts{grid-template-columns:1fr}}
    </style></head><body><button class="print-btn" onclick="window.print()">Drucken / als PDF sichern</button><header><div class="brand">Conference Manager <span style="color:#86bc25">.</span></div><h1>Willkommen</h1><p class="lead">Informationen für Ihre Teilnahme an „${esc(request.title)}“.</p></header>
    <div class="facts"><div class="fact"><small>Datum</small><strong>${fmtDate(request.date)}</strong></div><div class="fact"><small>Zeit</small><strong>${esc(request.start)}–${esc(request.end)}</strong></div><div class="fact"><small>Standort</small><strong>${esc(location)}</strong></div><div class="fact"><small>Raum</small><strong>${esc(room?.name||request.roomId||'—')} · ${esc(room?.floor||'Etage n/a')}</strong></div><div class="fact"><small>Teilnehmende</small><strong>${total} gesamt · ${external} extern</strong></div><div class="fact"><small>Ansprechpartner</small><strong>${printValue(site.contact)}${site.contactDetails?` · ${esc(site.contactDetails)}`:''}</strong></div></div>
    <div class="grid"><section class="section"><h2>Adresse & ÖPNV</h2><p><strong>${printValue(site.address)}</strong></p><p>${printValue(site.publicTransport)}</p>${site.mapsUrl?`<p>Routen-Link: ${esc(site.mapsUrl)}</p>`:''}</section><section class="section"><h2>PKW & Parken</h2><p>${printValue(site.carArrival)}</p><p>${printValue(site.parking)}</p></section></div>
    <div class="grid"><section class="section"><h2>Empfang & Zutritt</h2><p>${printValue(site.reception)}</p>${site.visitorNotes?`<p>${esc(site.visitorNotes)}</p>`:''}</section><section class="section"><h2>Im Gebäude</h2><p>${printValue(site.building)}</p>${site.accessibility?`<p><strong>Barrierefreiheit:</strong> ${esc(site.accessibility)}</p>`:''}</section></div>
    <div class="grid"><section class="section"><h2>Raum & Ausstattung</h2><p><strong>${esc(room?.name||'—')}</strong></p><p>${esc(room?.equipment||'Keine Ausstattungsinformationen')}</p>${floorplan?`<img class="floorplan" src="${esc(floorplan)}" alt="Floorplan">`:''}</section><section class="section"><h2>Verpflegung & Services</h2><p><strong>Bewirtung:</strong> ${esc(catering)}</p><p><strong>Services:</strong> ${esc(services)}</p></section></div>
    ${siteComplete(site)?'':`<div class="note incomplete"><strong>Hinweis für den Veranstalter:</strong> Einige Standortinformationen sind noch nicht gepflegt. Bitte vor Versand an externe Teilnehmende vervollständigen.</div>`}<div class="note"><strong>Bitte planen Sie ausreichend Zeit für Anmeldung und Orientierung im Gebäude ein.</strong></div></body></html>`);win.document.close();setTimeout(()=>{try{win.focus();win.print()}catch(_){}},500)
  }

  document.addEventListener('click',e=>{const detail=e.target.closest('[data-request-detail]');if(detail){e.preventDefault();openModal(detail.dataset.requestDetail)}});
  document.addEventListener('DOMContentLoaded',()=>{injectStyles();ensureModal();watchRequestList()});
})();