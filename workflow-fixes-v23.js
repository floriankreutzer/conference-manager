(function(){
  const REQUEST_KEY='conference_requests';
  const EDIT_KEY='conference_edit_request_v1';
  const q=(s,r=document)=>r.querySelector(s);

  function requests(){
    try{return JSON.parse(localStorage.getItem(REQUEST_KEY)||'[]')}catch{return[]}
  }
  function overlaps(a,b,c,d){return a<d&&c<b}

  function patchOwnReservation(){
    try{
      if(typeof mockCalendarBusy!=='function'||mockCalendarBusy.__workflowFixV23)return;
      const original=mockCalendarBusy;
      mockCalendarBusy=function(roomId){
        const editing=sessionStorage.getItem(EDIT_KEY);
        if(!editing)return original(roomId);
        const date=q('#date')?.value,start=q('#start')?.value,end=q('#end')?.value;
        return requests().some(r=>
          r.id!==editing&&r.roomId===roomId&&r.date===date&&
          !['Rejected','Cancelled'].includes(r.status)&&
          overlaps(start,end,r.start,r.end)
        );
      };
      mockCalendarBusy.__workflowFixV23=true;
    }catch(_){}
  }

  function navigationFix(){
    const profile=q('#profileAvatar'),help=q('.nav-item[data-view="help"]');
    if(profile&&help&&profile.nextElementSibling!==help)profile.insertAdjacentElement('afterend',help);
    document.addEventListener('click',e=>{
      const b=e.target.closest('.nav-item[data-view]');
      if(b&&b.dataset.view!=='help')q('#helpView')?.classList.add('hidden');
    },true);
  }

  function init(){
    patchOwnReservation();
    navigationFix();
    document.documentElement.dataset.workflowFixBuild='2026.08.22.23';
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
