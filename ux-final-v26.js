(function(){
  const REQUEST_KEY='conference_requests', EDIT_KEY='conference_edit_request_v1';
  const q=(s,r=document)=>r.querySelector(s),qa=(s,r=document)=>Array.from(r.querySelectorAll(s));
  const i18n=()=>window.cmI18n;
  const t=(k,v)=>i18n()?.t(k,v)||k;
  const getRequests=()=>{try{return JSON.parse(localStorage.getItem(REQUEST_KEY)||'[]')}catch{return[]}};
  const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
  const overlaps=(a,b,c,d)=>a<d&&c<b;
  let roomObs=null;

  function busy(roomId){
    const date=q('#date')?.value,start=q('#start')?.value,end=q('#end')?.value,editing=sessionStorage.getItem(EDIT_KEY);
    if(!date||!start||!end)return false;
    return getRequests().some(r=>r.id!==editing&&r.roomId===roomId&&r.date===date&&!['Rejected','Cancelled'].includes(r.status)&&overlaps(start,end,r.start,r.end));
  }
  function roomState(){
    let rooms=[];try{rooms=(catalog?.rooms||[]).filter(r=>r.active!==false)}catch(_){}
    const location=q('#location')?.value||'',participants=Number(q('#internalParticipants')?.value||0)+Number(q('#externalParticipants')?.value||0),date=q('#date')?.value,start=q('#start')?.value,end=q('#end')?.value;
    if(!location||participants<1||!date||!start||!end)return null;
    const atLocation=rooms.filter(r=>r.location===location);
    if(!atLocation.length)return{type:'location',location};
    const max=Math.max(...atLocation.map(r=>Number(r.capacity||0)),0),eligible=atLocation.filter(r=>Number(r.capacity||0)>=participants);
    if(!eligible.length)return{type:'capacity',location,participants,capacity:max};
    const free=eligible.filter(r=>!busy(r.id));
    if(!free.length)return{type:'busy',location,participants,count:eligible.length};
    return{type:'available'};
  }
  function openHelp(){const hidden=q('.nav-item[data-view="help"]');if(hidden){hidden.classList.remove('hidden');hidden.click();hidden.classList.add('hidden')}}
  function renderRecovery(){
    const root=q('#rooms');if(!root)return;const s=roomState();q('.room-recovery-v24',root)?.remove();q('#roomRecoveryV26',root)?.remove();if(!s||s.type==='available')return;
    const map={
      location:['room.none.location.title','room.none.location.text',{location:s.location}],
      capacity:['room.none.capacity.title','room.none.capacity.text',{location:s.location,participants:s.participants,capacity:s.capacity}],
      busy:['room.none.busy.title','room.none.busy.text',{participants:s.participants,count:s.count}]
    };
    const [titleKey,textKey,vars]=map[s.type]||['room.none.title','room.none.generic',{}];
    const box=document.createElement('div');box.id='roomRecoveryV26';box.className='room-recovery-v24';box.innerHTML=`<strong>${t(titleKey,vars)}</strong><p>${t(textKey,vars)}</p><div class="room-recovery-actions"><button type="button" class="secondary" data-room-recovery-v26="date">${t('room.changeSchedule')}</button><button type="button" class="secondary" data-room-recovery-v26="participants">${t('room.changeParticipants')}</button><button type="button" class="primary" data-room-recovery-v26="help">${t('room.contact')}</button></div>`;root.appendChild(box);
  }

  function copyRequest(id){
    const r=getRequests().find(x=>x.id===id);if(!r)return;
    const past=!!r.date&&r.date<today();sessionStorage.removeItem(EDIT_KEY);q('#helpView')?.classList.add('hidden');q('#welcomeView')?.classList.add('hidden');
    try{resetForm();switchView('employee');renderLocations()}catch(_){}
    const vals={title:r.title||'',location:r.location||'',date:past?'':(r.date||''),start:past?'':(r.start||''),end:past?'':(r.end||''),internalParticipants:r.internalParticipants??'',externalParticipants:r.externalParticipants??'',specialRequirements:r.specialRequirements||'',dietaryRequirements:r.dietaryRequirements||''};
    Object.entries(vals).forEach(([id2,v])=>{const el=q('#'+id2);if(el)el.value=v});
    try{state.step=1;state.roomId=past?null:(r.roomId||null);state.serviceIds=[...(r.serviceIds||[])];state.packageSelection=r.packageSelection?{packageId:r.packageSelection.packageId,tier:r.packageSelection.tier}:null;state.quantities={...(r.quantities||{})};state.allocations=JSON.parse(JSON.stringify(r.allocations?.length?r.allocations:[{costCenter:'',percent:100}]))}catch(_){}
    const hasItems=Object.values(r.quantities||{}).some(n=>Number(n)>0),mode=r.packageSelection&&hasItems?'BOTH':r.packageSelection?'PACKAGE':hasItems?'ITEMS':'NONE';sessionStorage.setItem('conference_catering_mode_v21',mode);
    const cp=q('#cateringParticipants');if(cp){cp.value=r.cateringParticipants?String(r.cateringParticipants):'';cp.dataset.manual=r.cateringParticipants?'1':''}
    try{updateParticipantTotal();renderRooms();renderServices();renderPackages();renderItems();renderAllocations();updateCosts();updateStep()}catch(_){}
    q('#duplicateBannerV26')?.remove();const banner=document.createElement('div');banner.id='duplicateBannerV26';banner.className='duplicate-banner-v24';banner.innerHTML=`<strong>${past?t('requests.repeat'):t('requests.repeatRejected')}</strong><p>${past?t('requests.copiedPast'):t('requests.copied')}</p>`;q('#employeeView .stepper')?.insertAdjacentElement('afterend',banner);
    if(past){q('#date')?.focus()}setTimeout(()=>{renderRecovery();i18n()?.apply(document.body)},0);
    try{toast(past?t('requests.copiedPast'):t('requests.copied'))}catch(_){}
  }

  function translateProfileRole(){const out=q('#currentRoleValue');if(out){const v=localStorage.getItem('conference_demo_role_v1')||'employee';out.textContent=i18n()?.role(v)||out.textContent}}
  function patchLanguageSelector(){const sel=q('#profileLanguage');if(!sel||sel.__i18n26)return;sel.__i18n26=1;sel.value=i18n()?.language()||'de';sel.addEventListener('change',e=>{i18n()?.setLanguage(e.target.value)})}

  function events(){
    document.addEventListener('click',e=>{
      const rr=e.target.closest('[data-room-recovery-v26]');if(rr){e.preventDefault();const a=rr.dataset.roomRecoveryV26;if(a==='date'){try{state.step=1;updateStep()}catch(_){}q('#date')?.focus()}else if(a==='participants'){try{state.step=1;updateStep()}catch(_){}q('#internalParticipants')?.focus()}else openHelp();return}
      const repeat=e.target.closest('[data-repeat-request]');if(repeat){e.preventDefault();e.stopImmediatePropagation();copyRequest(repeat.dataset.repeatRequest)}
    },true);
    ['location','date','start','end','internalParticipants','externalParticipants'].forEach(id=>q('#'+id)?.addEventListener('change',()=>setTimeout(renderRecovery,0)));
    window.addEventListener('conference-language-changed',()=>setTimeout(()=>{translateProfileRole();renderRecovery()},0));
  }
  function observers(){const root=q('#rooms');if(root&&!roomObs){roomObs=new MutationObserver(()=>requestAnimationFrame(renderRecovery));roomObs.observe(root,{childList:true})}}
  function init(){patchLanguageSelector();translateProfileRole();renderRecovery();events();observers();document.documentElement.dataset.uxFinalBuild='2026.08.22.26'}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
