(function(){
  const RK='conference_requests', CK='conference_catalog_v2';
  const q=(s,r=document)=>r.querySelector(s), qa=(s,r=document)=>Array.from(r.querySelectorAll(s));
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const reqs=()=>{try{return JSON.parse(localStorage.getItem(RK)||'[]')}catch{return[]}};
  const cat=()=>{try{return JSON.parse(localStorage.getItem(CK)||'null')}catch{return null}};
  const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
  const fmtDateTime=v=>{if(!v)return'';const d=new Date(v);return Number.isNaN(d.getTime())?'':d.toLocaleString('de-DE',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})};
  let requestObserver=null, reportObserver=null, reportScheduled=false;

  function injectStyles(){
    if(q('#uxEnhancementsV16Styles'))return;
    const s=document.createElement('style');
    s.id='uxEnhancementsV16Styles';
    s.textContent=`
      .topbar{background:#000!important;color:#fff!important;border-bottom:5px solid #86bc25!important}
      .topbar h1{color:#fff!important}.topbar p{color:#d0d0ce!important}.topbar .profile-shell{margin-left:auto;flex:0 0 auto}
      .topbar .profile-avatar{background:#fff!important;color:#000!important;border-color:#86bc25!important}
      .topbar .profile-avatar:hover{box-shadow:0 0 0 3px rgba(134,188,37,.28)}
      .request-timeline{margin:16px 0 2px;padding:14px 12px 12px;border-top:1px solid #d0d0ce;background:#fafafa}
      .request-timeline-title{display:block;font-size:13px;margin-bottom:12px}
      .request-timeline-list{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:0}
      .request-timeline-step{position:relative;padding:28px 8px 0 0;color:#63666a;min-width:0}
      .request-timeline-step::before{content:'';position:absolute;left:0;top:9px;width:100%;height:3px;background:#d0d0ce}
      .request-timeline-step::after{content:'';position:absolute;left:0;top:2px;width:16px;height:16px;border-radius:50%;background:#fff;border:3px solid #97999b;z-index:1}
      .request-timeline-step.done::before,.request-timeline-step.current::before{background:#000}
      .request-timeline-step.done::after{background:#000;border-color:#000;box-shadow:inset 0 -4px 0 #86bc25}
      .request-timeline-step.current::after{background:#86bc25;border-color:#000}
      .request-timeline-step.problem::after{background:#fff7e6;border-color:#a15c00}
      .request-timeline-step strong{display:block;font-size:12px;color:#000;line-height:1.3}
      .request-timeline-step small{display:block;font-size:11px;line-height:1.35;margin-top:3px;color:#63666a}
      .report-catering-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px}
      .report-catering-summary{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px}
      .report-catering-summary span{padding:7px 9px;background:#f3f3f3;border-left:3px solid #86bc25;font-size:12px}
      @media(max-width:760px){.request-timeline-list{grid-template-columns:1fr}.request-timeline-step{padding:4px 0 16px 34px}.request-timeline-step::before{left:8px;top:0;width:3px;height:100%}.request-timeline-step::after{left:1px;top:0}.report-catering-grid{grid-template-columns:1fr}}
    `;
    document.head.appendChild(s);
  }

  function requestId(card){const m=(q('.request-meta',card)?.textContent||'').match(/CR-\d{4}-\d+/);return m?m[0]:null}
  function historyFor(r){return Array.isArray(r.statusHistory)?r.statusHistory:[]}
  function historyTime(r,statuses){const h=[...historyFor(r)].reverse().find(x=>statuses.includes(x.status));return h?.at||''}
  function timelineModel(r){
    const resultMap={Confirmed:'Bestätigt',Rejected:'Abgelehnt',Cancelled:'Storniert','Change Requested':'Änderung angefordert'};
    const terminal=['Confirmed','Rejected','Cancelled','Change Requested'].includes(r.status);
    const inReview=['In Review'].includes(r.status);
    const submitted=['Submitted'].includes(r.status);
    const result=resultMap[r.status]||'Entscheidung offen';
    const created=fmtDateTime(r.createdAt);
    const reviewAt=fmtDateTime(historyTime(r,['In Review','Change Requested','Confirmed','Rejected']));
    const resultAt=fmtDateTime(r.cancelledAt||historyTime(r,['Confirmed','Rejected','Cancelled','Change Requested']));
    return [
      {label:'Anfrage gesendet',detail:created||'Erfasst',cls:'done'},
      {label:'Vorläufig reserviert',detail:r.calendarStatus==='Released'?'Reservierung freigegeben':'Raum tentative gehalten',cls:'done'},
      {label:'Manager-Prüfung',detail:submitted?'Zur Prüfung':(inReview?'In Prüfung':(reviewAt||'Bearbeitet')),cls:submitted||inReview?'current':'done'},
      {label:result,detail:resultAt||(terminal?'Aktueller Stand':'Noch offen'),cls:terminal?(r.status==='Rejected'||r.status==='Cancelled'?'problem':'done'):''}
    ];
  }
  function decorateRequestTimelines(){
    const map=new Map(reqs().map(r=>[r.id,r]));
    qa('#requestList .request-card').forEach(card=>{
      const r=map.get(requestId(card));if(!r)return;
      const model=timelineModel(r),sig=JSON.stringify(model);
      let box=q('.request-timeline',card);
      if(!box){box=document.createElement('div');box.className='request-timeline';const actions=q('.request-actions',card);if(actions)card.insertBefore(box,actions);else card.appendChild(box)}
      if(box.dataset.sig===sig)return;
      box.dataset.sig=sig;
      box.innerHTML=`<strong class="request-timeline-title">Buchungsverlauf</strong><ol class="request-timeline-list" aria-label="Buchungsverlauf">${model.map((x,i)=>`<li class="request-timeline-step ${x.cls}" ${x.cls==='current'?'aria-current="step"':''}><strong>${i+1}. ${esc(x.label)}</strong><small>${esc(x.detail)}</small></li>`).join('')}</ol>`;
    });
  }
  function watchRequests(){
    const list=q('#requestList');if(!list||requestObserver)return;
    requestObserver=new MutationObserver(decorateRequestTimelines);
    requestObserver.observe(list,{childList:true});
    decorateRequestTimelines();
  }

  function saveStatusSnapshot(id){
    setTimeout(()=>{
      const all=reqs(),r=all.find(x=>x.id===id);if(!r)return;
      r.statusHistory=historyFor(r);
      const last=r.statusHistory[r.statusHistory.length-1];
      if(!last||last.status!==r.status){r.statusHistory.push({status:r.status,calendarStatus:r.calendarStatus||'',at:new Date().toISOString()});localStorage.setItem(RK,JSON.stringify(all))}
      decorateRequestTimelines();
    },0);
  }
  function captureHistory(){
    document.addEventListener('click',e=>{
      const a=e.target.closest('[data-manager-action]');if(a)saveStatusSnapshot(a.dataset.requestId);
      const c=e.target.closest('[data-cancel-request]');if(c)saveStatusSnapshot(c.dataset.cancelRequest);
    });
  }

  function range(type,ref){
    const base=new Date((ref||today())+'T12:00:00');let start,end;
    if(type==='DAY'){start=new Date(base);end=new Date(base)}
    else if(type==='MONTH'){start=new Date(base.getFullYear(),base.getMonth(),1,12);end=new Date(base.getFullYear(),base.getMonth()+1,0,12)}
    else if(type==='QUARTER'){const sm=Math.floor(base.getMonth()/3)*3;start=new Date(base.getFullYear(),sm,1,12);end=new Date(base.getFullYear(),sm+3,0,12)}
    else{start=new Date(base.getFullYear(),0,1,12);end=new Date(base.getFullYear(),11,31,12)}
    const iso=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    return{start:iso(start),end:iso(end)};
  }
  function cateringData(){
    const type=q('#reportPeriod')?.value||'MONTH',ref=q('#reportReferenceDate')?.value||today(),rg=range(type,ref),confirmed=reqs().filter(r=>r.status==='Confirmed'&&r.date>=rg.start&&r.date<=rg.end),c=cat()||{cateringItems:[]};
    const packages=new Map(),extras=new Map();let bookingsWithCatering=0,totalParticipants=0;
    confirmed.forEach(r=>{
      let has=false;const participants=Number((r.participants??((r.internalParticipants||0)+(r.externalParticipants||0)))||0);
      if(r.packageSelection){has=true;const name=`${r.packageSelection.packageName||r.packageSelection.packageId} · ${r.packageSelection.tier||''}`.trim();const x=packages.get(name)||{name,count:0,participants:0};x.count++;x.participants+=participants;packages.set(name,x)}
      Object.entries(r.quantities||{}).forEach(([id,n])=>{n=Number(n||0);if(n<=0)return;has=true;const item=c.cateringItems?.find(i=>i.id===id),name=item?.name||id,x=extras.get(id)||{name,count:0,quantity:0,unit:item?.unit||''};x.count++;x.quantity+=n;extras.set(id,x)});
      if(has){bookingsWithCatering++;totalParticipants+=participants}
    });
    return{confirmed,bookingsWithCatering,totalParticipants,packages:[...packages.values()].sort((a,b)=>b.count-a.count||b.participants-a.participants),extras:[...extras.values()].sort((a,b)=>b.quantity-a.quantity||b.count-a.count)};
  }
  function enhanceReport(){
    const out=q('#reportContent');if(!out||q('.report-catering-section',out))return;
    const d=cateringData(),rate=d.confirmed.length?d.bookingsWithCatering/d.confirmed.length*100:0,section=document.createElement('div');section.className='report-catering-section';
    const packageRows=d.packages.length?`<div style="overflow:auto"><table class="report-table"><thead><tr><th>Catering</th><th>Buchungen</th><th>Teilnehmende</th></tr></thead><tbody>${d.packages.map(x=>`<tr><td><strong>${esc(x.name)}</strong></td><td>${x.count}</td><td>${x.participants}</td></tr>`).join('')}</tbody></table></div>`:'<div class="report-empty">Keine Catering-Pakete in bestätigten Buchungen.</div>';
    const extraRows=d.extras.length?`<div style="overflow:auto"><table class="report-table"><thead><tr><th>Einzeloption</th><th>Buchungen</th><th>Menge</th></tr></thead><tbody>${d.extras.map(x=>`<tr><td><strong>${esc(x.name)}</strong></td><td>${x.count}</td><td>${x.quantity}${x.unit?` · ${esc(x.unit)}`:''}</td></tr>`).join('')}</tbody></table></div>`:'<div class="report-empty">Keine Catering-Einzeloptionen in bestätigten Buchungen.</div>';
    section.innerHTML=`<div class="report-catering-summary"><span>${d.bookingsWithCatering} Buchungen mit Catering</span><span>${rate.toFixed(0)} % Catering-Abdeckung</span><span>${d.totalParticipants} Teilnehmende mit Catering</span></div><div class="report-catering-grid"><section class="report-card"><h3>Gebuchte Caterings</h3>${packageRows}</section><section class="report-card"><h3>Catering-Einzeloptionen</h3>${extraRows}</section></div>`;
    const insights=q('.report-insight',out);if(insights)out.insertBefore(section,insights);else out.appendChild(section);
  }
  function scheduleReport(){if(reportScheduled)return;reportScheduled=true;setTimeout(()=>{reportScheduled=false;enhanceReport()},0)}
  function watchReport(){
    const out=q('#reportContent');if(!out||reportObserver)return;
    reportObserver=new MutationObserver(scheduleReport);reportObserver.observe(out,{childList:true});enhanceReport();
  }

  function init(){injectStyles();watchRequests();captureHistory();watchReport();const root=q('#managerView');if(root&&!root.__ux16Observed){const o=new MutationObserver(()=>{watchReport();watchRequests()});o.observe(root,{childList:true,subtree:false});root.__ux16Observed=true}}
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',init):init();
})();