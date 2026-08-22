(function(){
 const RK='conference_requests';
 const q=(s,r=document)=>r.querySelector(s),qa=(s,r=document)=>Array.from(r.querySelectorAll(s)),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
 const t=(k,v)=>window.cmI18n?.t?.(k,v)||k;
 const get=()=>{try{return JSON.parse(localStorage.getItem(RK)||'[]')}catch{return[]}};
 const fmt=v=>window.cmI18n?.dateTime?.(v)||'';
 let obs=null;
 function rid(card){return(q('.request-meta',card)?.textContent||'').match(/CR-\d{4}-\d+/)?.[0]||null}
 function events(r){const all=[];for(const x of (r.statusHistory||[]))all.push(x);for(const x of (r.timelineEvents||[]))all.push(x);if(r.createdAt)all.push({status:'Submitted',at:r.createdAt,note:''});const seen=new Set();return all.filter(x=>{const k=`${x.status}|${x.at||''}|${x.note||''}`;if(seen.has(k))return false;seen.add(k);return true}).sort((a,b)=>String(a.at||'').localeCompare(String(b.at||'')))}
 function lastEvent(r,statuses){return [...events(r)].reverse().find(x=>statuses.includes(x.status))}
 function model(r){const submitted=lastEvent(r,['Submitted']),review=lastEvent(r,['In Review','Change Requested','Confirmed','Rejected']),result=lastEvent(r,['Confirmed','Rejected','Cancelled','Change Requested']);const terminal=['Confirmed','Rejected','Cancelled','Change Requested'].includes(r.status);const resultLabel=window.cmI18n?.status?.(r.status)||r.status;return[
  {label:t('timeline.sent'),detail:fmt(submitted?.at||r.createdAt)||t('timeline.recorded'),cls:'done'},
  {label:t('timeline.provisional'),detail:r.calendarStatus==='Released'?t('timeline.released'):t('timeline.held'),cls:'done'},
  {label:t('timeline.review'),detail:r.status==='Submitted'?t('status.submitted'):r.status==='In Review'?t('status.review'):(fmt(review?.at)||t('timeline.processed')),cls:['Submitted','In Review'].includes(r.status)?'current':'done'},
  {label:terminal?resultLabel:t('timeline.pending'),detail:fmt(result?.at)||(terminal?t('timeline.current'):t('timeline.open')),cls:terminal?(['Rejected','Cancelled'].includes(r.status)?'problem':'done'):''}
 ]}
 function render(){const map=new Map(get().map(r=>[r.id,r]));qa('#requestList .request-card').forEach(card=>{const r=map.get(rid(card));if(!r)return;const m=model(r),sig=JSON.stringify(m);let box=q('.request-timeline',card);if(!box){box=document.createElement('div');box.className='request-timeline';const actions=q('.request-actions',card);actions?card.insertBefore(box,actions):card.appendChild(box)}if(box.dataset.v27sig===sig)return;box.dataset.v27sig=sig;box.innerHTML=`<strong class="request-timeline-title">${esc(t('timeline.title'))}</strong><ol class="request-timeline-list" aria-label="${esc(t('timeline.title'))}">${m.map((x,i)=>`<li class="request-timeline-step ${x.cls}" ${x.cls==='current'?'aria-current="step"':''}><strong>${i+1}. ${esc(x.label)}</strong><small>${esc(x.detail)}</small></li>`).join('')}</ol>`})}
 function init(){render();const list=q('#requestList');if(list&&!obs){obs=new MutationObserver(render);obs.observe(list,{childList:true})}window.addEventListener('conference-request-updated',()=>setTimeout(render,0));document.documentElement.dataset.timelineBuild='2026.08.22.27'}
 document.readyState==='loading'?document.addEventListener('DOMContentLoaded',init,{once:true}):init();
})();
