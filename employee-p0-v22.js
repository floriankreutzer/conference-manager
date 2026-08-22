(function(){
  const q=(s,r=document)=>r.querySelector(s);

  function clearFreshDefaults(){
    const internal=q('#internalParticipants');
    const external=q('#externalParticipants');
    if(internal)internal.value='';
    if(external)external.value='';
    try{
      if(typeof state!=='undefined'){
        state.roomId=null;
        state.allocations=[{costCenter:'',percent:100}];
      }
      if(typeof updateParticipantTotal==='function')updateParticipantTotal();
      if(typeof renderAllocations==='function')renderAllocations();
      if(typeof renderRooms==='function')renderRooms();
      if(typeof updateCosts==='function')updateCosts();
    }catch(_){}
  }

  function reservationLanguage(){
    const box=q('.step-panel[data-panel="6"] .tentative-box');
    if(box){
      const strong=q('strong',box),p=q('p',box);
      if(strong)strong.textContent='Raum wird vorläufig reserviert';
      if(p)p.textContent='Nach dem Absenden halten wir den ausgewählten Raum zunächst für Sie frei. Die Buchung wird verbindlich, sobald das Conference Management Ihre Anfrage bestätigt.';
    }
  }

  function patchReset(){
    try{
      if(typeof resetForm!=='function'||resetForm.__employeeP0V22)return;
      const original=resetForm;
      resetForm=function(){
        original();
        clearFreshDefaults();
        reservationLanguage();
      };
      resetForm.__employeeP0V22=true;
    }catch(_){}
  }

  function patchToast(){
    try{
      if(typeof toast!=='function'||toast.__employeeP0V22)return;
      const original=toast;
      toast=function(message){
        let next=String(message??'');
        next=next.replace(/Raum tentative reserviert\.?/gi,'Raum vorläufig reserviert.');
        next=next.replace(/tentative reserviert/gi,'vorläufig reserviert');
        return original(next);
      };
      toast.__employeeP0V22=true;
    }catch(_){}
  }

  function init(){
    reservationLanguage();
    patchReset();
    patchToast();
    const draftExists=!!localStorage.getItem('conference_request_draft_v1');
    if(!draftExists)clearFreshDefaults();
    document.documentElement.dataset.employeeP0Build='2026.08.22.22';
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
