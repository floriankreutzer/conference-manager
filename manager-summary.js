(function(){
  const REQUEST_KEY='conference_requests',CATALOG_KEY='conference_catalog_v2';
  const qsa=(s,r=document)=>Array.from(r.querySelectorAll(s));
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  function reqs(){try{return JSON.parse(localStorage.getItem(REQUEST_KEY)||'[]')}catch{return[]}}
  function cat(){try{return JSON.parse(localStorage.getItem(CATALOG_KEY)||'null')}catch{return null}}
  function extractId(card){return((card.querySelector('.request-meta')?.textContent||'').match(/CR-\d{4}-\d+/)||[])[0]||null}
  function decorate(){
    const requests=reqs(),catalog=cat();
    qsa('#managerList .request-card').forEach(card=>{
      const id=extractId(card),r=requests.find(x=>x.id===id);if(!r)return;
      const room=catalog?.rooms?.find(x=>x.id===r.roomId);
      const services=(r.serviceIds||[]).map(x=>catalog?.services?.find(s=>s.id===x)?.name||x);
      const extras=Object.entries(r.quantities||{}).filter(([,q])=>Number(q)>0).map(([x,q])=>`${q}× ${catalog?.cateringItems?.find(i=>i.id===x)?.name||x}`);
      const catering=r.packageSelection?`${r.packageSelection.packageName||r.packageSelection.packageId} ${r.packageSelection.tier}`:'Ohne Paket';
      const participants=r.participants??((r.internalParticipants||0)+(r.externalParticipants||0));
      const signature=JSON.stringify([room?.name||r.roomId,participants,r.externalParticipants||0,catering,services,extras,r.status]);
      let box=card.querySelector('.manager-booking-summary-safe');
      if(!box){box=document.createElement('div');box.className='manager-booking-summary manager-booking-summary-safe';const actions=card.querySelector('.request-actions');if(actions)card.insertBefore(box,actions);else card.appendChild(box)}
      if(box.dataset.signature!==signature){box.dataset.signature=signature;box.innerHTML=`<strong>Gebucht</strong><div class="manager-booking-chips"><span>${esc(room?.name||r.roomId||'—')}</span><span>${participants} Personen${r.externalParticipants?` · ${r.externalParticipants} extern`:''}</span><span>${esc(catering)}</span></div><small>Services: ${esc(services.length?services.join(', '):'Keine Zusatzservices')}${extras.length?` · Extras: ${esc(extras.join(', '))}`:''}</small>`}
      let actions=card.querySelector('.request-actions');if(!actions){actions=document.createElement('div');actions.className='request-actions';card.appendChild(actions)}
      if(!card.querySelector('[data-request-detail]')){const b=document.createElement('button');b.type='button';b.className='secondary';b.dataset.requestDetail=id;b.textContent='Details anzeigen';actions.insertBefore(b,actions.firstChild)}
    });
  }
  function init(){const list=document.getElementById('managerList');if(!list||list.__safeSummaryObserved)return;const o=new MutationObserver(decorate);o.observe(list,{childList:true});list.__safeSummaryObserved=true;decorate()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
