(function(){
  function registerLate(){
    if(!window.cmI18n||!Array.isArray(window.CM_I18N_PACKS))return;
    window.CM_I18N_PACKS.forEach(pack=>window.cmI18n.register(pack));
    window.cmI18n.apply(document.body);
    document.documentElement.dataset.i18nLateRegisterBuild='2026.08.22.28';
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',registerLate,{once:true});
  else registerLate();
})();
