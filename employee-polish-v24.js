(function(){
  const RK='conference_requests', ROLE='conference_demo_role_v1', LANG='conference_language_v1', EDIT='conference_edit_request_v1', NK='conference_notifications_v1';
  const q=(s,r=document)=>r.querySelector(s), qa=(s,r=document)=>Array.from(r.querySelectorAll(s));
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const get=()=>{try{return JSON.parse(localStorage.getItem(RK)||'[]')}catch{return[]}};
  const save=rs=>localStorage.setItem(RK,JSON.stringify(rs));
  let reviewObs=null, roomObs=null, listObs=null;

  function css(){
    if(q('#employeePolishV24Css'))return;
    const s=document.createElement('style');s.id='employeePolishV24Css';s.textContent=`
      .profile-current-role{padding:9px 0;border-bottom:1px solid #ededed}.profile-current-role small{display:block;color:#63666a}.profile-current-role strong{display:block;margin-top:2px}.profile-demo-field{background:#fafafa;margin:8px -6px 0;padding:9px 6px;border:1px solid #ededed}.profile-demo-field .role-note{margin-top:6px}.profile-language-field{padding:9px 0;border-bottom:1px solid #ededed}.profile-language-field small{display:block;color:#63666a}.profile-language-field select{margin-top:6px;width:100%}
      .review-extra-card{border-top-color:var(--hospitality-camel,#C29A6B)!important}.room-recovery-v24{margin-top:12px;padding:14px;border:1px solid #d0d0ce;border-left:5px solid #a15c00;background:#fff7e6}.room-recovery-v24 strong{display:block}.room-recovery-v24 p{margin:5px 0 10px;color:#53565a}.room-recovery-actions{display:flex;gap:8px;flex-wrap:wrap}
      .request-state-guidance-v24{margin-top:11px;padding:10px 12px;background:#fafafa;border-left:4px solid #75787b;color:#53565a;font-size:13px;line-height:1.45}.request-state-guidance-v24 strong{display:block;color:#000;margin-bottom:3px}.request-card.status-action-required-v24{border-left:6px solid #a15c00!important}.request-card.status-action-required-v24 .request-state-guidance-v24{background:#fff7e6;border-left-color:#a15c00}.timeline-reason-v24{margin:8px 0 0;padding:8px 10px;background:#fff7e6;border-left:3px solid #a15c00;font-size:12px;color:#53565a}
      .nav-badge-v24{display:inline-grid;place-items:center;min-width:20px;height:20px;border-radius:999px;background:#a15c00;color:#fff;font-size:11px;font-weight:800;padding:0 6px;margin-left:auto}.profile-help-btn{width:100%;text-align:left;margin-top:8px}.context-help-link{margin-top:8px}.duplicate-banner-v24{margin:0 0 16px;padding:14px 16px;border:1px solid #d0d0ce;border-left:5px solid var(--brand-bordeaux,#7A1F3D);background:#fafafa}.duplicate-banner-v24 strong{display:block}.duplicate-banner-v24 p{margin:5px 0;color:#53565a}
      .cancel-overlay-v24{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:14000;display:none;align-items:center;justify-content:center;padding:16px}.cancel-overlay-v24.open{display:flex}.cancel-modal-v24{width:min(520px,100%);background:#fff;border:1px solid #d0d0ce;padding:20px}.cancel-modal-v24 h2{margin:0 0 8px}.cancel-modal-v24 p{color:#53565a}.cancel-actions-v24{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}
      .field-error-v24{outline:3px solid rgba(180,35,24,.25)!important;border-color:#b42318!important}.validation-summary-v24{margin:0 0 14px;padding:12px 14px;background:#fff0ee;border-left:5px solid #b42318}.validation-summary-v24 strong{display:block}.validation-summary-v24 p{margin:4px 0 0;color:#53565a}
      @media(max-width:640px){.room-recovery-actions,.cancel-actions-v24{flex-direction:column}.room-recovery-actions button,.cancel-actions-v24 button{width:100%}}
    `;document.head.appendChild(s);
  }

  function roleLabel(v){return v==='manager'?'Conference Manager':'Mitarbeiter'}
  function profile(){
    const menu=q('#profileMenu');if(!menu)return;
    const demo=q('#demoRoleSelect');
    if(demo){
      const old=demo.closest('.profile-field');if(old){old.classList.add('profile-demo-field');old.classList.remove('profile-field');const sm=q('small',old);if(sm)sm.textContent='Demo: Rolle wechseln';const note=q('.role-note',old);if(note)note.textContent='Nur für Demo-Zwecke. Produktiv wird die Rolle über SSO und Berechtigungen vorgegeben.'}
      if(!q('#currentRoleField',menu)){const f=document.createElement('div');f.id='currentRoleField';f.className='profile-current-role';f.innerHTML='<small>Rolle</small><strong id="currentRoleValue"></strong>';old?.insertAdjacentElement('beforebegin',f)}
      const sync=()=>{const v=localStorage.getItem(ROLE)||'employee';const out=q('#currentRoleValue');if(out)out.textContent=roleLabel(v)};sync();demo.addEventListener('change',()=>setTimeout(sync,0));
    }
    if(!q('#profileLanguageField',menu)){
      const f=document.createElement('div');f.id='profileLanguageField';f.className='profile-language-field';f.innerHTML='<label for="profileLanguage"><small>Sprache / Language</small></label><select id="profileLanguage"><option value="de">Deutsch</option><option value="en">English</option></select><span class="role-note">Weitere Sprachen können später ergänzt werden.</span>';
      const logout=q('#profileLogout',menu);logout?.insertAdjacentElement('beforebegin',f);const sel=q('#profileLanguage',f);sel.value=localStorage.getItem(LANG)||'de';sel.addEventListener('change',()=>{localStorage.setItem(LANG,sel.value);location.reload()});
    }
    const helpNav=q('.nav-item[data-view="help"]');if(helpNav)helpNav.classList.add('hidden');
    if(!q('#profileHelpBtn',menu)){const b=document.createElement('button');b.type='button';b.id='profileHelpBtn';b.className='secondary profile-help-btn';b.textContent='Hilfe & Kontakt';const logout=q('#profileLogout',menu);logout?.insertAdjacentElement('beforebegin',b);b.addEventListener('click',()=>openHelp())}
  }

  function openHelp(){
    const hidden=q('.nav-item[data-view="help"]');if(hidden){hidden.classList.remove('hidden');hidden.click();hidden.classList.add('hidden');q('#profileMenu')?.setAttribute('hidden','')}
  }

  function reviewExtras(){
    const root=q('#review'),grid=q('.review-grid',root);if(!grid)return;
    qa('.review-extra-card',grid).forEach(x=>x.remove());
    const special=q('#specialRequirements')?.value.trim()||'', dietary=q('#dietaryRequirements')?.value.trim()||'', mode=sessionStorage.getItem('conference_catering_mode_v21')||'NONE', cp=Number(q('#cateringParticipants')?.value||0);
    if(special)grid.insertAdjacentHTML('beforeend',`<div class="review-card review-extra-card"><h3>Besondere Anforderungen</h3><p>${esc(special)}</p></div>`);
    if(mode!=='NONE')grid.insertAdjacentHTML('beforeend',`<div class="review-card review-extra-card"><h3>Catering-Details</h3><p><strong>${cp||0} Personen</strong></p><p>${dietary?esc(dietary):'Keine Ernährungs- oder Unverträglichkeitsangaben'}</p></div>`);
  }

  function invalidStep(){
    const title=q('#title'),loc=q('#location'),date=q('#date'),start=q('#start'),end=q('#end'),i=q('#internalParticipants'),e=q('#externalParticipants');
    const total=Number(i?.value||0)+Number(e?.value||0),today=new Date().toISOString().slice(0,10);
    if(!title?.value.trim())return{step:1,el:title,msg:'Bitte einen Titel eingeben.'};
    if(!loc?.value)return{step:1,el:loc,msg:'Bitte einen Standort auswählen.'};
    if(!date?.value)return{step:1,el:date,msg:'Bitte ein Datum auswählen.'};
    if(date.value<today)return{step:1,el:date,msg:'Bitte ein heutiges oder zukünftiges Datum auswählen.'};
    if(!start?.value)return{step:1,el:start,msg:'Bitte eine Startzeit auswählen.'};
    if(!end?.value||end.value<=start.value)return{step:1,el:end,msg:'Bitte eine gültige Endzeit nach der Startzeit auswählen.'};
    if(total<1)return{step:1,el:i,msg:'Bitte mindestens eine teilnehmende Person angeben.'};
    try{if(!state.roomId)return{step:2,el:q('#rooms'),msg:'Bitte einen verfügbaren Raum auswählen.'}}catch(_){}
    try{const sum=state.allocations.reduce((a,b)=>a+Number(b.percent||0),0);if(Math.abs(sum-100)>.01)return{step:5,el:q('#allocations'),msg:'Die Kostenanteile müssen zusammen 100 % ergeben.'};if(state.allocations.some(a=>!String(a.costCenter||'').trim()))return{step:5,el:q('#allocations [data-cc]'),msg:'Bitte alle Kostenstellen ausfüllen.'}}catch(_){}
    return null;
  }
  function showInvalid(v){
    qa('.field-error-v24').forEach(x=>x.classList.remove('field-error-v24'));q('#validationSummaryV24')?.remove();
    try{state.step=v.step;updateStep()}catch(_){}
    const panel=q(`.step-panel[data-panel="${v.step}"]`);if(panel){const b=document.createElement('div');b.id='validationSummaryV24';b.className='validation-summary-v24';b.innerHTML=`<strong>Bitte noch eine Angabe prüfen</strong><p>${esc(v.msg)}</p>`;panel.insertBefore(b,panel.firstChild)}
    if(v.el instanceof HTMLElement){v.el.classList.add('field-error-v24');setTimeout(()=>v.el.focus?.(),0)}
    try{toast(v.msg)}catch(_){}
  }
  function validation(){
    document.addEventListener('click',e=>{
      const submit=e.target.closest('#submitBtn');if(!submit)return;const v=invalidStep();if(v){e.preventDefault();e.stopImmediatePropagation();showInvalid(v)}
    },true);
  }

  function roomsRecovery(){
    const root=q('#rooms');if(!root)return;const existing=q('.room-recovery-v24',root),empty=qa('.info-box',root).find(x=>/Kein Raum erfüllt/i.test(x.textContent));if(!empty){existing?.remove();return}if(existing)return;
    const box=document.createElement('div');box.className='room-recovery-v24';box.innerHTML='<strong>Kein passender Raum verfügbar</strong><p>Ändern Sie Termin oder Teilnehmerzahl – oder kontaktieren Sie das Conference Management.</p><div class="room-recovery-actions"><button type="button" class="secondary" data-room-recovery="date">Termin ändern</button><button type="button" class="secondary" data-room-recovery="participants">Teilnehmerzahl ändern</button><button type="button" class="primary" data-room-recovery="help">Conference Management kontaktieren</button></div>';root.appendChild(box);
  }

  function requestId(card){return(q('.request-meta',card)?.textContent||'').match(/CR-\d{4}-\d+/)?.[0]||null}
  function statusGuidance(r){
    if(r.status==='Submitted'||r.status==='In Review')return['Keine Aktion erforderlich','Der Raum ist vorläufig reserviert. Das Conference Management prüft Ihre Anfrage.'];
    if(r.status==='Change Requested')return['Aktion erforderlich',r.changeReason||'Bitte bearbeiten Sie die angeforderte Änderung und reichen Sie die Anfrage erneut ein.'];
    if(r.status==='Confirmed')return['Verbindlich bestätigt','Die Buchung ist bestätigt. Gästeinformationen und PDF stehen zur Verfügung.'];
    if(r.status==='Rejected')return['Anfrage abgelehnt',r.rejectionReason||'Die Anfrage konnte nicht bestätigt werden. Sie können eine neue Anfrage auf Basis dieser Daten starten.'];
    if(r.status==='Cancelled')return['Anfrage storniert','Die Reservierung wurde freigegeben. Sie können die Veranstaltung erneut anfragen.'];
    return null;
  }
  function decorateRequests(){
    const map=new Map(get().map(r=>[r.id,r]));let actionable=0;
    qa('#requestList .request-card').forEach(card=>{const r=map.get(requestId(card));if(!r)return;card.classList.toggle('status-action-required-v24',r.status==='Change Requested');if(r.status==='Change Requested')actionable++;
      let g=q('.request-state-guidance-v24',card),info=statusGuidance(r);if(info){if(!g){g=document.createElement('div');g.className='request-state-guidance-v24';(q('.request-grid',card)||q('.request-top',card))?.insertAdjacentElement('afterend',g)}g.innerHTML=`<strong>${esc(info[0])}</strong>${esc(info[1])}`}else g?.remove();
      const actions=q('.request-actions',card)||(()=>{const a=document.createElement('div');a.className='request-actions';card.appendChild(a);return a})();
      if(['Rejected','Cancelled'].includes(r.status)&&!q('[data-repeat-request]',actions)){const b=document.createElement('button');b.type='button';b.className='primary';b.dataset.repeatRequest=r.id;b.textContent=r.status==='Rejected'?'Neue Anfrage auf Basis dieser Daten':'Erneut anfragen';actions.insertBefore(b,actions.firstChild)}
      const timeline=q('.request-timeline',card)||q('[aria-label="Buchungsverlauf"]',card);let tr=q('.timeline-reason-v24',card);if(r.status==='Change Requested'&&r.changeReason&&timeline){if(!tr){tr=document.createElement('div');tr.className='timeline-reason-v24';timeline.insertAdjacentElement('afterend',tr)}tr.innerHTML=`<strong>Änderungsgrund:</strong> ${esc(r.changeReason)}`}else tr?.remove();
    });
    const nav=q('.nav-item[data-view="requests"]');if(nav){let badge=q('.nav-badge-v24',nav);if(actionable){if(!badge){badge=document.createElement('span');badge.className='nav-badge-v24';nav.appendChild(badge)}badge.textContent=String(actionable);nav.setAttribute('aria-label',`Meine Anfragen, ${actionable} Aktion${actionable===1?'':'en'} erforderlich`)}else{badge?.remove();nav.removeAttribute('aria-label')}}
  }

  function loadAsNew(id){
    const r=get().find(x=>x.id===id);if(!r)return;sessionStorage.removeItem(EDIT);q('#helpView')?.classList.add('hidden');q('#welcomeView')?.classList.add('hidden');try{switchView('employee');renderLocations()}catch(_){}
    const vals={title:r.title||'',location:r.location||'',date:r.date||'',start:r.start||'',end:r.end||'',internalParticipants:r.internalParticipants??'',externalParticipants:r.externalParticipants??'',specialRequirements:r.specialRequirements||'',dietaryRequirements:r.dietaryRequirements||''};Object.entries(vals).forEach(([k,v])=>{const el=q('#'+k);if(el)el.value=v});
    try{state.step=1;state.roomId=r.roomId||null;state.serviceIds=[...(r.serviceIds||[])];state.packageSelection=r.packageSelection?{packageId:r.packageSelection.packageId,tier:r.packageSelection.tier}:null;state.quantities={...(r.quantities||{})};state.allocations=JSON.parse(JSON.stringify(r.allocations?.length?r.allocations:[{costCenter:'',percent:100}]))}catch(_){}
    const hasItems=Object.values(r.quantities||{}).some(n=>Number(n)>0),mode=r.packageSelection&&hasItems?'BOTH':r.packageSelection?'PACKAGE':hasItems?'ITEMS':'NONE';sessionStorage.setItem('conference_catering_mode_v21',mode);const cp=q('#cateringParticipants');if(cp){cp.value=r.cateringParticipants?String(r.cateringParticipants):(r.participants?String(r.participants):'');cp.dataset.manual=r.cateringParticipants?'1':''}
    try{updateParticipantTotal();renderRooms();renderServices();renderPackages();renderItems();renderAllocations();updateCosts();updateStep()}catch(_){}
    q('#duplicateBannerV24')?.remove();const b=document.createElement('div');b.id='duplicateBannerV24';b.className='duplicate-banner-v24';b.innerHTML=`<strong>Neue Anfrage auf Basis von ${esc(r.id)}</strong><p>Die bisherigen Angaben wurden übernommen. Prüfen Sie insbesondere Termin, Raum und Teilnehmerzahl vor dem Absenden.</p>`;q('#employeeView .stepper')?.insertAdjacentElement('afterend',b);try{toast('Angaben wurden in eine neue Anfrage übernommen.')}catch(_){}
  }

  function ensureCancelModal(){if(q('#cancelOverlayV24'))return;const o=document.createElement('div');o.id='cancelOverlayV24';o.className='cancel-overlay-v24';o.innerHTML='<div class="cancel-modal-v24" role="dialog" aria-modal="true" aria-labelledby="cancelTitleV24"><h2 id="cancelTitleV24">Anfrage stornieren?</h2><p id="cancelTextV24"></p><div class="cancel-actions-v24"><button type="button" class="secondary" id="cancelCloseV24">Zurück</button><button type="button" class="danger-btn" id="cancelConfirmV24">Anfrage stornieren</button></div></div>';document.body.appendChild(o);q('#cancelCloseV24').addEventListener('click',()=>o.classList.remove('open'));o.addEventListener('click',e=>{if(e.target===o)o.classList.remove('open')});q('#cancelConfirmV24').addEventListener('click',confirmCancel)}
  function openCancel(id){ensureCancelModal();const r=get().find(x=>x.id===id);if(!r)return;const o=q('#cancelOverlayV24');o.dataset.id=id;q('#cancelTextV24').textContent=`${r.title} · ${r.date||''} · ${r.start||''}–${r.end||''}. Die Raumreservierung wird freigegeben.`;o.classList.add('open')}
  function notify(title,text,id){let ns=[];try{ns=JSON.parse(localStorage.getItem(NK)||'[]')}catch(_){}ns.unshift({id:'N-'+Date.now(),title,text,requestId:id,at:new Date().toISOString()});localStorage.setItem(NK,JSON.stringify(ns.slice(0,30)));window.dispatchEvent(new CustomEvent('conference-notifications-changed'))}
  function confirmCancel(){const o=q('#cancelOverlayV24'),id=o?.dataset.id,rs=get(),r=rs.find(x=>x.id===id);if(!r)return;r.status='Cancelled';r.calendarStatus='Released';r.cancelledAt=new Date().toISOString();r.timelineEvents=[...(r.timelineEvents||[]),{status:'Cancelled',at:r.cancelledAt,note:'Vom Anfragenden storniert'}];save(rs);o.classList.remove('open');notify('Anfrage storniert',`${r.title} wurde storniert.`,id);try{renderRequests();renderManager();toast(`${id} storniert · Raumreservierung freigegeben.`)}catch(_){}window.dispatchEvent(new CustomEvent('conference-request-updated'))}

  function contextualHelp(){
    const cost=q('#costCenterHelp');if(cost&&!q('#costHelpBtn')){const b=document.createElement('button');b.id='costHelpBtn';b.type='button';b.className='secondary context-help-link';b.textContent='Hilfe anzeigen';cost.insertAdjacentElement('afterend',b);b.addEventListener('click',openHelp)}
  }

  function events(){
    document.addEventListener('click',e=>{
      const recovery=e.target.closest('[data-room-recovery]');if(recovery){const a=recovery.dataset.roomRecovery;if(a==='help')openHelp();else{try{state.step=1;updateStep()}catch(_){}setTimeout(()=>q(a==='date'?'#date':'#internalParticipants')?.focus(),0)}return}
      const rep=e.target.closest('[data-repeat-request]');if(rep){e.preventDefault();loadAsNew(rep.dataset.repeatRequest);return}
      const cancel=e.target.closest('[data-cancel-request]');if(cancel){e.preventDefault();e.stopImmediatePropagation();openCancel(cancel.dataset.cancelRequest);return}
    },true);
    window.addEventListener('conference-request-updated',()=>setTimeout(()=>{decorateRequests();reviewExtras()},0));
    window.addEventListener('conference-edit-loaded',()=>setTimeout(reviewExtras,0));
  }

  function observers(){
    const review=q('#review');if(review&&!reviewObs){reviewObs=new MutationObserver(reviewExtras);reviewObs.observe(review,{childList:true})}
    const rooms=q('#rooms');if(rooms&&!roomObs){roomObs=new MutationObserver(roomsRecovery);roomObs.observe(rooms,{childList:true})}
    const list=q('#requestList');if(list&&!listObs){listObs=new MutationObserver(decorateRequests);listObs.observe(list,{childList:true})}
  }

  function init(){css();profile();validation();reviewExtras();roomsRecovery();decorateRequests();contextualHelp();ensureCancelModal();events();observers();document.documentElement.dataset.employeePolishBuild='2026.08.22.24'}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
