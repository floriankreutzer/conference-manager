(function(){
  const EDIT_KEY='conference_edit_request_v1';
  const q=(s,r=document)=>r.querySelector(s);
  const t=(k,v)=>window.cmI18n?.t?.(k,v)||k;
  const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};

  function error(step,el,key,vars){return{step,el,key,vars:vars||{}}}
  function validate(){
    const title=q('#title'),loc=q('#location'),date=q('#date'),start=q('#start'),end=q('#end'),internal=q('#internalParticipants'),external=q('#externalParticipants');
    const i=Number(internal?.value||0),e=Number(external?.value||0),total=i+e;
    if(!title?.value.trim())return error(1,title,'validation.title');
    if(!loc?.value)return error(1,loc,'validation.location');
    if(!date?.value)return error(1,date,'validation.date');
    if(date.value<today())return error(1,date,'validation.dateFuture');
    if(i<0||e<0)return error(1,i<0?internal:external,'validation.negative');
    if(!start?.value)return error(1,start,'validation.start');
    if(!end?.value||end.value<=start.value)return error(1,end,'validation.end');
    if(total<1)return error(1,internal,'validation.participants');
    try{if(!state.roomId)return error(2,q('#rooms'),'validation.room')}catch(_){return error(2,q('#rooms'),'validation.room')}
    try{
      const allocations=Array.isArray(state.allocations)?state.allocations:[];
      if(allocations.some(a=>!String(a.costCenter||'').trim()))return error(5,q('#allocations [data-cc]')||q('#allocations'),'validation.centers');
      if(allocations.some(a=>!Number.isFinite(Number(a.percent))||Number(a.percent)<0||Number(a.percent)>100))return error(5,q('#allocations [data-pct]')||q('#allocations'),'validation.percentRange');
      const sum=allocations.reduce((a,b)=>a+Number(b.percent||0),0);
      if(Math.abs(sum-100)>.01)return error(5,q('#allocations'),'validation.alloc');
    }catch(_){return error(5,q('#allocations'),'validation.alloc')}
    return null;
  }

  function show(err){
    document.querySelectorAll('.field-error-v24').forEach(x=>x.classList.remove('field-error-v24'));
    q('#validationSummaryV24')?.remove();
    try{state.step=err.step;updateStep()}catch(_){}
    const message=t(err.key,err.vars),panel=q(`.step-panel[data-panel="${err.step}"]`);
    if(panel){const box=document.createElement('div');box.id='validationSummaryV24';box.className='validation-summary-v24';box.innerHTML=`<strong>${t('validation.heading')}</strong><p>${String(message).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))}</p>`;panel.insertBefore(box,panel.firstChild)}
    if(err.el instanceof HTMLElement){err.el.classList.add('field-error-v24');setTimeout(()=>err.el.focus?.(),0)}
    try{toast(message)}catch(_){}
    return false;
  }
  function validateAndShow(){const err=validate();return err?show(err):true}

  function appendHistory(r,status,note,at){
    const ts=at||new Date().toISOString();
    r.statusHistory=Array.isArray(r.statusHistory)?r.statusHistory:[];
    const last=r.statusHistory[r.statusHistory.length-1];
    if(!last||last.status!==status||last.at!==ts)r.statusHistory.push({status,calendarStatus:r.calendarStatus||'',at:ts,note:note||''});
    r.timelineEvents=Array.isArray(r.timelineEvents)?r.timelineEvents:[];
    r.timelineEvents.push({status,at:ts,note:note||''});
    return ts;
  }

  window.cmWorkflow={validate,showValidation:show,validateAndShow,appendHistory,today,editing:()=>sessionStorage.getItem(EDIT_KEY)};
  document.documentElement.dataset.workflowCoreBuild='2026.08.22.27';
})();
