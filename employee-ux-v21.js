(function(){
  const DRAFT_KEY='conference_request_draft_v1';
  const q=(s,r=document)=>r.querySelector(s),qa=(s,r=document)=>Array.from(r.querySelectorAll(s));
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const fmtDateTime=iso=>{try{return new Date(iso).toLocaleString('de-DE',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})}catch{return''}};
  let roomObserver=null,serviceObserver=null,packageObserver=null,itemObserver=null,requestsObserver=null,reviewObserver=null;

  function css(){
    if(q('#employeeUxV21Styles'))return;
    const s=document.createElement('style');s.id='employeeUxV21Styles';s.textContent=`
      .optional-chip{font-style:normal;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;padding:3px 6px;background:#ededed;color:#53565a;margin-left:3px;border-radius:999px}
      .employee-hint{margin:10px 0 16px;padding:11px 13px;background:#fafafa;border-left:4px solid var(--brand-bordeaux,#7A1F3D);color:#53565a;font-size:13px;line-height:1.45}
      .after-submit-box{margin:16px 0;padding:15px 16px;border:1px solid #d0d0ce;border-left:5px solid var(--brand-bordeaux,#7A1F3D);background:#fafafa}.after-submit-box h3{margin:0 0 9px;font-size:16px}.after-submit-box ol{margin:0;padding-left:20px;color:#53565a}.after-submit-box li+li{margin-top:5px}
      .draft-btn{margin-right:4px}.draft-card{border:1px solid #d0d0ce;border-left:5px solid var(--brand-bordeaux,#7A1F3D);background:#fafafa;padding:14px 16px;margin:0 0 16px}.draft-card strong{display:block}.draft-card p{margin:5px 0;color:#53565a}.draft-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
      .room-fit{display:flex;gap:7px;flex-wrap:wrap;margin:8px 0 0}.room-fit span{font-size:11px;font-weight:700;padding:4px 7px;background:#f3f3f3;border-left:3px solid var(--brand-bordeaux,#7A1F3D)}.room-fit .recommended{background:#f6edf0;color:#651D32}
      .service-guidance{margin-top:9px;padding:8px 10px;background:#fafafa;border-left:3px solid var(--brand-bordeaux,#7A1F3D);font-size:12px;color:#53565a;line-height:1.4}.service-guidance strong{color:#000}
      .catering-mode{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:0 0 18px}.catering-mode button{min-height:58px;text-align:left;border:1px solid #d0d0ce;background:#fff;padding:10px 12px}.catering-mode button strong,.catering-mode button small{display:block}.catering-mode button small{color:#63666a;margin-top:3px}.catering-mode button[aria-pressed="true"]{border-color:#000;background:var(--hospitality-camel-soft,#F5EEE6);box-shadow:inset 0 -4px 0 var(--hospitality-camel,#C29A6B)}.catering-hidden{display:none!important}.catering-mode-note{font-size:12px;color:#63666a;margin:-7px 0 16px}
      .cost-estimate-note{font-size:12px;color:#63666a;margin-top:10px}.welcome-first-use-note{margin-top:12px;color:#e7d5c1!important;font-size:13px!important}.welcome-actions [data-home-go="employee"]{min-width:210px}
      @media(max-width:860px){.catering-mode{grid-template-columns:repeat(2,1fr)}}@media(max-width:520px){.catering-mode{grid-template-columns:1fr}.draft-actions button{width:100%}}
    `;document.head.appendChild(s);
  }

  function optionalLabels(){
    const step3=q('.step[data-step="3"]'),step4=q('.step[data-step="4"]');
    [[step3,'Services'],[step4,'Bewirtung']].forEach(([b,label])=>{if(!b||q('.optional-chip',b))return;const chip=document.createElement('em');chip.className='optional-chip';chip.textContent='optional';b.appendChild(chip);b.setAttribute('aria-label',`${label}, optional`)});
    const p3=q('.step-panel[data-panel="3"]'),p4=q('.step-panel[data-panel="4"]');
    if(p3){const h=q('.section-heading h2',p3);if(h&&!/optional/i.test(h.textContent))h.textContent='Personal & Services (optional)';if(!q('.employee-hint',p3)){const d=document.createElement('div');d.className='employee-hint';d.textContent='Keine zusätzlichen Services benötigt? Sie können diesen Schritt ohne Auswahl fortsetzen.';q('#services',p3)?.insertAdjacentElement('beforebegin',d)}}
    if(p4){const h=q('.section-heading h2',p4);if(h&&!/optional/i.test(h.textContent))h.textContent='Bewirtung (optional)'}
  }

  function reviewExpectation(){
    const p=q('.step-panel[data-panel="6"]');if(!p||q('#afterSubmitBox'))return;
    const box=document.createElement('div');box.id='afterSubmitBox';box.className='after-submit-box';box.innerHTML='<h3>Was passiert nach dem Absenden?</h3><ol><li>Der ausgewählte Raum wird vorläufig reserviert.</li><li>Das Conference Management prüft Raum, Services, Bewirtung und Kosten.</li><li>Sie erhalten eine Bestätigung oder eine Änderungsanfrage.</li><li>Nach Bestätigung stehen die Gästeinformationen zur Verfügung.</li></ol>';
    q('.tentative-box',p)?.insertAdjacentElement('beforebegin',box);
  }

  function costLanguage(){
    const p=q('.step-panel[data-panel="5"]');if(!p)return;
    const h=q('.section-heading h2',p);if(h)h.textContent='Voraussichtliche Kosten & Verteilung';
    const txt=q('.section-heading p',p);if(txt)txt.textContent='Die voraussichtlichen Kosten werden vor der Freigabe transparent ausgewiesen.';
    const total=q('.cost-summary .total span',p);if(total)total.textContent='Voraussichtlicher Gesamtbetrag';
    if(!q('.cost-estimate-note',p)){const n=document.createElement('p');n.className='cost-estimate-note';n.textContent='Die Beträge basieren auf der aktuellen Auswahl. Änderungen im Prüfprozess können den finalen Betrag beeinflussen.';q('.cost-summary',p)?.insertAdjacentElement('afterend',n)}
    const review=q('.step-panel[data-panel="6"]');if(review){qa('.review-card h3',review).forEach(x=>{if(x.textContent.trim()==='Gesamtkosten')x.textContent='Voraussichtliche Gesamtkosten'})}
  }

  function welcomeFocus(){
    const hero=q('.welcome-hero');if(!hero)return;
    const h=q('h2',hero),p=q('p',hero);if(h)h.textContent='Willkommen, Florian.';if(p)p.textContent='Planen Sie eine Konferenz oder behalten Sie Ihre bestehenden Buchungen im Blick.';
    const create=q('[data-home-go="employee"]',hero),mine=q('[data-home-go="requests"]',hero);if(create)create.textContent='Neue Konferenz anfragen';if(mine)mine.textContent='Meine Buchungen ansehen';
    if(!q('.welcome-first-use-note',hero)){const n=document.createElement('p');n.className='welcome-first-use-note';n.textContent='In wenigen Schritten von Termin und Raum bis zur geprüften Buchungsanfrage.';q('.welcome-actions',hero)?.insertAdjacentElement('afterend',n)}
    renderDraftSurfaces();
  }

  function readDraft(){try{return JSON.parse(localStorage.getItem(DRAFT_KEY)||'null')}catch{return null}}
  function snapshot(){
    const field=id=>q('#'+id)?.value??'';
    let st={step:1,roomId:null,serviceIds:[],packageSelection:null,quantities:{},allocations:[]};
    try{st={step:state.step,roomId:state.roomId,serviceIds:[...state.serviceIds],packageSelection:state.packageSelection?{...state.packageSelection}:null,quantities:{...state.quantities},allocations:JSON.parse(JSON.stringify(state.allocations))}}catch(_){}
    return{savedAt:new Date().toISOString(),cateringMode:cateringState(),fields:{title:field('title'),location:field('location'),date:field('date'),start:field('start'),end:field('end'),internalParticipants:field('internalParticipants'),externalParticipants:field('externalParticipants')},state:st};
  }
  function saveDraft(){localStorage.setItem(DRAFT_KEY,JSON.stringify(snapshot()));renderDraftSurfaces();try{toast('Entwurf gespeichert.')}catch(_){}}
  function deleteDraft(){localStorage.removeItem(DRAFT_KEY);renderDraftSurfaces();try{toast('Entwurf gelöscht.')}catch(_){}}
  function restoreDraft(){
    const d=readDraft();if(!d)return;
    try{
      q('#welcomeView')?.classList.add('hidden');
      if(typeof switchView==='function')switchView('employee');
      if(typeof renderLocations==='function')renderLocations();
      Object.entries(d.fields||{}).forEach(([id,v])=>{const el=q('#'+id);if(el)el.value=v});
      if(d.cateringMode)sessionStorage.setItem('conference_catering_mode_v21',d.cateringMode);
      if(typeof state!=='undefined'){
        state.step=Math.max(1,Math.min(6,Number(d.state?.step||1)));state.roomId=d.state?.roomId||null;state.serviceIds=[...(d.state?.serviceIds||[])];state.packageSelection=d.state?.packageSelection?{...d.state.packageSelection}:null;state.quantities={...(d.state?.quantities||{})};state.allocations=JSON.parse(JSON.stringify(d.state?.allocations?.length?d.state.allocations:[{costCenter:'471100',percent:100}]));
      }
      if(typeof updateParticipantTotal==='function')updateParticipantTotal();
      if(typeof renderRooms==='function')renderRooms();if(typeof renderServices==='function')renderServices();if(typeof renderPackages==='function')renderPackages();if(typeof renderItems==='function')renderItems();if(typeof renderAllocations==='function')renderAllocations();if(typeof updateCosts==='function')updateCosts();if(typeof updateStep==='function')updateStep();
      setTimeout(()=>{optionalLabels();roomFit();serviceGuidance();ensureCateringMode();costLanguage();reviewExpectation()},0);
      try{toast('Entwurf wiederhergestellt.')}catch(_){ }
    }catch(e){console.error('Draft restore failed',e)}
  }
  function draftCardHtml(d){return `<div class="draft-card"><strong>Gespeicherter Entwurf</strong><p>${esc(d.fields?.title||'Neue Konferenzanfrage')} · gespeichert ${esc(fmtDateTime(d.savedAt))}</p><div class="draft-actions"><button type="button" class="primary" data-draft-action="restore">Entwurf fortsetzen</button><button type="button" class="secondary" data-draft-action="delete">Entwurf löschen</button></div></div>`}
  function renderDraftSurfaces(){
    const d=readDraft();
    let box=q('#requestDraftCard');const host=q('#requestsView .card');if(host){if(d){if(!box){box=document.createElement('div');box.id='requestDraftCard';q('#requestList',host)?.insertAdjacentElement('beforebegin',box)}box.innerHTML=draftCardHtml(d)}else box?.remove()}
    const hero=q('.welcome-hero');let hb=q('#welcomeDraftAction',hero);if(hero){if(d){if(!hb){hb=document.createElement('button');hb.id='welcomeDraftAction';hb.type='button';hb.className='secondary';hb.dataset.draftAction='restore';q('.welcome-actions',hero)?.appendChild(hb)}hb.textContent='Entwurf fortsetzen'}else hb?.remove()}
  }
  function drafts(){
    const actions=q('.wizard-actions');if(actions&&!q('#saveDraftBtn',actions)){const b=document.createElement('button');b.type='button';b.id='saveDraftBtn';b.className='secondary draft-btn';b.textContent='Entwurf speichern';const spacer=q('.spacer',actions);actions.insertBefore(b,spacer||actions.firstChild);b.addEventListener('click',saveDraft)}
    renderDraftSurfaces();
    if(!document.body.__draftActionsV21){document.body.__draftActionsV21=1;document.addEventListener('click',e=>{const b=e.target.closest('[data-draft-action]');if(!b)return;e.preventDefault();b.dataset.draftAction==='restore'?restoreDraft():deleteDraft()});const submit=q('#submitBtn');if(submit)submit.addEventListener('click',()=>{let before=0;try{before=getRequests().length}catch(_){try{before=JSON.parse(localStorage.getItem('conference_requests')||'[]').length}catch(_){}}setTimeout(()=>{let after=before;try{after=getRequests().length}catch(_){try{after=JSON.parse(localStorage.getItem('conference_requests')||'[]').length}catch(_){}}if(after>before){localStorage.removeItem(DRAFT_KEY);renderDraftSurfaces()}},50)})}
  }

  function roomFit(){
    const root=q('#rooms');if(!root)return;const total=Number(q('#internalParticipants')?.value||0)+Number(q('#externalParticipants')?.value||0);const cards=qa(':scope > [data-room]',root);if(!cards.length)return;
    const byCapacity=new Map();try{catalog.rooms.forEach(r=>byCapacity.set(r.id,Number(r.capacity||0)))}catch(_){ }
    const sorted=[...cards].sort((a,b)=>{const ra=Math.max(0,(byCapacity.get(a.dataset.room)||999)-total),rb=Math.max(0,(byCapacity.get(b.dataset.room)||999)-total);const ba=/Belegt/i.test(q('.badge',a)?.textContent||''),bb=/Belegt/i.test(q('.badge',b)?.textContent||'');return Number(ba)-Number(bb)||ra-rb});
    const current=cards.map(x=>x.dataset.room).join('|'),want=sorted.map(x=>x.dataset.room).join('|');if(current!==want)sorted.forEach(x=>root.appendChild(x));
    const best=sorted.find(x=>!/Belegt/i.test(q('.badge',x)?.textContent||''));
    sorted.forEach(card=>{const cap=byCapacity.get(card.dataset.room)||0,reserve=Math.max(0,cap-total);let fit=q('.room-fit',card);if(!fit){fit=document.createElement('div');fit.className='room-fit';const price=q('.price',card);price?.insertAdjacentElement('beforebegin',fit)}fit.innerHTML=`<span>Kapazität ${cap} · ${total} benötigt</span><span>${reserve} ${reserve===1?'Platz':'Plätze'} Reserve</span>${card===best?'<span class="recommended">Beste Passung</span>':''}`})
  }

  const serviceHints={host:['Empfohlen bei externen Gästen','Hilft bei Empfang, Orientierung und Gästebetreuung.'],av:['Empfohlen für hybride Veranstaltungen','Sinnvoll bei Video, Präsentationen oder komplexerer Veranstaltungstechnik.'],it:['Empfohlen bei geschäftskritischen Meetings','Zusätzliche Absicherung für Meeting- und Präsentationstechnik.'],service:['Empfohlen mit Catering','Unterstützt Ausgabe, Betreuung und Raumservice während der Veranstaltung.']};
  function serviceGuidance(){qa('#services [data-service]').forEach(card=>{const hint=serviceHints[card.dataset.service];if(!hint)return;let b=q('.service-guidance',card);if(!b){b=document.createElement('div');b.className='service-guidance';card.insertBefore(b,q('.price',card)||null)}b.innerHTML=`<strong>${esc(hint[0])}</strong><br>${esc(hint[1])}`})}

  function cateringState(){return sessionStorage.getItem('conference_catering_mode_v21')||'NONE'}
  function setCateringMode(mode,clear=true){
    sessionStorage.setItem('conference_catering_mode_v21',mode);const packages=q('#packages'),items=q('#cateringItems'),divider=q('.step-panel[data-panel="4"] .divider'),itemTitle=q('.step-panel[data-panel="4"] h3'),itemNote=q('.step-panel[data-panel="4"] .section-note');
    qa('[data-catering-mode]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.cateringMode===mode?'true':'false'));
    const showP=mode==='PACKAGE'||mode==='BOTH',showI=mode==='ITEMS'||mode==='BOTH';packages?.classList.toggle('catering-hidden',!showP);items?.classList.toggle('catering-hidden',!showI);divider?.classList.toggle('catering-hidden',!showI);itemTitle?.classList.toggle('catering-hidden',!showI);itemNote?.classList.toggle('catering-hidden',!showI);
    if(clear){try{if(mode==='NONE'){state.packageSelection=null;Object.keys(state.quantities||{}).forEach(k=>state.quantities[k]=0)}else if(mode==='PACKAGE'){Object.keys(state.quantities||{}).forEach(k=>state.quantities[k]=0)}else if(mode==='ITEMS'){state.packageSelection=null}if(typeof renderPackages==='function')renderPackages();if(typeof renderItems==='function')renderItems();if(typeof updateCosts==='function')updateCosts()}catch(_){}}
  }
  function ensureCateringMode(){
    const p=q('.step-panel[data-panel="4"]');if(!p)return;let mode=q('#cateringModeV21');if(!mode){mode=document.createElement('div');mode.id='cateringModeV21';mode.innerHTML='<div class="catering-mode" role="group" aria-label="Art der Bewirtung"><button type="button" data-catering-mode="NONE"><strong>Keine Bewirtung</strong><small>Ohne Catering fortfahren</small></button><button type="button" data-catering-mode="PACKAGE"><strong>Catering-Paket</strong><small>Vordefiniertes Paket auswählen</small></button><button type="button" data-catering-mode="ITEMS"><strong>Nur Einzeloptionen</strong><small>Getränke oder Snacks einzeln</small></button><button type="button" data-catering-mode="BOTH"><strong>Paket + Extras</strong><small>Paket mit Einzeloptionen ergänzen</small></button></div><p class="catering-mode-note">Wählen Sie zuerst, welche Art der Bewirtung Sie benötigen.</p>';q('#packages',p)?.insertAdjacentElement('beforebegin',mode);mode.addEventListener('click',e=>{const b=e.target.closest('[data-catering-mode]');if(b)setCateringMode(b.dataset.cateringMode,true)})}
    setCateringMode(cateringState(),false);
  }

  function requestCostLabels(){qa('#requestList .request-grid div').forEach(cell=>{const small=q('small',cell);if(small&&small.textContent.trim()==='Kosten')small.textContent='Voraussichtliche Kosten'})}

  function observe(){
    const rooms=q('#rooms');if(rooms&&!roomObserver){roomObserver=new MutationObserver(()=>requestAnimationFrame(roomFit));roomObserver.observe(rooms,{childList:true})}
    const services=q('#services');if(services&&!serviceObserver){serviceObserver=new MutationObserver(()=>requestAnimationFrame(serviceGuidance));serviceObserver.observe(services,{childList:true})}
    const packages=q('#packages');if(packages&&!packageObserver){packageObserver=new MutationObserver(()=>requestAnimationFrame(()=>setCateringMode(cateringState(),false)));packageObserver.observe(packages,{childList:true})}
    const items=q('#cateringItems');if(items&&!itemObserver){itemObserver=new MutationObserver(()=>requestAnimationFrame(()=>setCateringMode(cateringState(),false)));itemObserver.observe(items,{childList:true})}
    const req=q('#requestList');if(req&&!requestsObserver){requestsObserver=new MutationObserver(()=>{renderDraftSurfaces();requestCostLabels()});requestsObserver.observe(req,{childList:true})}
    const review=q('#review');if(review&&!reviewObserver){reviewObserver=new MutationObserver(costLanguage);reviewObserver.observe(review,{childList:true})}
  }

  function init(){css();optionalLabels();reviewExpectation();costLanguage();welcomeFocus();drafts();roomFit();serviceGuidance();ensureCateringMode();requestCostLabels();observe();document.documentElement.dataset.employeeUxBuild='2026.08.22.21'}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
