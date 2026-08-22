(function(){
  function disableLegacyManagerObserver(){
    const list=document.getElementById('managerList');
    if(list) list.__guestObserved=true;
  }
  disableLegacyManagerObserver();
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',disableLegacyManagerObserver,{once:true});
})();
