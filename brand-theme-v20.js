(function(){
  const BORDEAUX='#7A1F3D';
  const BORDEAUX_DARK='#651D32';
  const CAMEL='#C29A6B';
  const CAMEL_DARK='#8A6848';
  const CAMEL_SOFT='#F5EEE6';
  const CATALOG_KEY='conference_catalog_v2';

  function applyVariables(){
    const root=document.documentElement;
    root.style.setProperty('--brand-bordeaux',BORDEAUX);
    root.style.setProperty('--brand-bordeaux-dark',BORDEAUX_DARK);
    root.style.setProperty('--hospitality-camel',CAMEL);
    root.style.setProperty('--hospitality-camel-dark',CAMEL_DARK);
    root.style.setProperty('--hospitality-camel-soft',CAMEL_SOFT);
    // Legacy token retained for compatibility with the existing CSS.
    root.style.setProperty('--deloitte-green',BORDEAUX);
  }

  function injectTheme(){
    let s=document.getElementById('brandThemeV20');
    if(!s){s=document.createElement('style');s.id='brandThemeV20';document.head.appendChild(s)}
    s.textContent=`
      html body .sidebar{border-color:${BORDEAUX}!important}
      html body .brand-mark span,html body .topbar h1::after,html body .section-heading h2::after{color:${BORDEAUX}!important}
      html body .nav-item.active,html body .nav-item:hover{border-left-color:${BORDEAUX}!important}
      html body .profile-nav-avatar{border-color:${BORDEAUX}!important}
      html body .step.active{box-shadow:inset 0 -4px 0 ${BORDEAUX}!important}
      html body .primary:hover,html body .primary.success{box-shadow:inset 0 -4px 0 ${BORDEAUX}!important}
      html body .option-card.selected{box-shadow:inset 0 -5px 0 ${BORDEAUX}!important}
      html body .participant-total,html body .tentative-box{border-left-color:${BORDEAUX}!important}
      html body .cost-summary .total{box-shadow:inset 0 -5px 0 ${BORDEAUX}!important}
      html body .review-card h3{border-bottom-color:${BORDEAUX}!important}
      html body .stat,html body .manager-kpi-action:not(.attention):not(.tentative),html body .report-kpi{border-top-color:${BORDEAUX}!important}
      html body .manager-tab.active,html body .catalog-tab.active{border-bottom-color:${BORDEAUX}!important}
      html body .toast{border-left-color:${BORDEAUX}!important}
      html body .manager-quick-filters button[aria-pressed="true"],html body .catalog-group-nav-v3 button[aria-pressed="true"],html body .room-plan-view-toggle-v3 button[aria-pressed="true"],html body .room-plan-view-toggle button[aria-pressed="true"],html body .request-view-tools button[aria-pressed="true"]{box-shadow:inset 0 -4px 0 ${BORDEAUX}!important}
      html body .request-calendar td.today{box-shadow:inset 0 0 0 3px ${BORDEAUX}!important}
      html body .request-timeline-step.done::after{box-shadow:inset 0 -4px 0 ${BORDEAUX}!important}
      html body .request-timeline-step.current::after{background:${BORDEAUX}!important;border-color:#000!important}
      html body .report-bar span{border-bottom-color:${BORDEAUX}!important}
      html body .report-insight .good{border-left-color:${BORDEAUX}!important}
      html body .manager-card-summary-v3{border-left:4px solid ${BORDEAUX}!important}
      html body .primary:focus-visible,html body .nav-item:focus-visible{outline-color:${BORDEAUX}!important}
      html body input:focus,html body select:focus,html body textarea:focus{box-shadow:0 0 0 2px rgba(122,31,61,.22)!important}

      /* Hospitality layer: warm accent only where the experience is guest/catering oriented. */
      html body .welcome-hero{border-bottom-color:${CAMEL}!important}
      html body .welcome-eyebrow{color:#E2CBB3!important}
      html body .welcome-kpi{border-top-color:${CAMEL}!important}
      html body .welcome-next{border-left-color:${CAMEL}!important}
      html body .guest-info-head{border-bottom-color:${CAMEL}!important}
      html body .guest-info-card h3{border-bottom-color:${CAMEL}!important}
      html body .wifi-box{border-left-color:${CAMEL}!important;background:${CAMEL_SOFT}!important}
      html body .package-variant.selected{box-shadow:inset 0 -5px 0 ${CAMEL}!important}
      html body [data-catalog-tab="catering"].active,html body [data-catalog-tab="items"].active,html body #catalogItemsTab.active{border-bottom-color:${CAMEL}!important}
      html body .report-catering-summary span{border-left-color:${CAMEL}!important;background:${CAMEL_SOFT}!important}
      html body .report-catering-grid .report-card{border-top:3px solid ${CAMEL}!important}
      html body #cateringItems .qty-control button:focus-visible,html body .package-variant:focus-visible{outline-color:${CAMEL_DARK}!important}
    `;
  }

  function migrateGeneratedFloorplans(){
    try{
      const data=JSON.parse(localStorage.getItem(CATALOG_KEY)||'null');
      if(!data||!Array.isArray(data.rooms))return;
      let changed=false;
      data.rooms.forEach(room=>{
        if(typeof room.floorplanImage!=='string'||!room.floorplanImage.startsWith('data:image/svg+xml'))return;
        let img=room.floorplanImage;
        const replacements=[
          ['%2386bc25','%23C29A6B'],['%2386BC25','%23C29A6B'],['#86bc25','#C29A6B'],['#86BC25','#C29A6B'],
          ['%23046a38','%238A6848'],['%23046A38','%238A6848'],['#046a38','#8A6848'],['#046A38','#8A6848'],
          ['%23eef7df','%23F5EEE6'],['%23EEF7DF','%23F5EEE6'],['#eef7df','#F5EEE6'],['#EEF7DF','#F5EEE6']
        ];
        replacements.forEach(([a,b])=>{if(img.includes(a)){img=img.split(a).join(b);changed=true}});
        room.floorplanImage=img;
      });
      if(changed)localStorage.setItem(CATALOG_KEY,JSON.stringify(data));
    }catch(_){}
  }

  function init(){applyVariables();injectTheme();migrateGeneratedFloorplans();document.documentElement.dataset.brandTheme='bordeaux-camel-v20'}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();