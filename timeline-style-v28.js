(function(){
  if(document.getElementById('timelineV28Styles'))return;
  const s=document.createElement('style');s.id='timelineV28Styles';s.textContent=`
    .request-timeline{margin:16px 0 2px;padding:14px 12px 12px;border-top:1px solid #d0d0ce;background:#fafafa}
    .request-timeline-title{display:block;font-size:13px;margin-bottom:12px}
    .request-timeline-list{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:0}
    .request-timeline-step{position:relative;padding:28px 8px 0 0;color:#63666a;min-width:0}
    .request-timeline-step::before{content:'';position:absolute;left:0;top:9px;width:100%;height:3px;background:#d0d0ce}
    .request-timeline-step::after{content:'';position:absolute;left:0;top:2px;width:16px;height:16px;border-radius:50%;background:#fff;border:3px solid #97999b;z-index:1}
    .request-timeline-step.done::before,.request-timeline-step.current::before{background:#000}
    .request-timeline-step.done::after{background:#000;border-color:#000;box-shadow:inset 0 -4px 0 var(--brand-bordeaux,#7A1F3D)}
    .request-timeline-step.current::after{background:var(--brand-bordeaux,#7A1F3D);border-color:#000}
    .request-timeline-step.problem::after{background:#fff7e6;border-color:#a15c00}
    .request-timeline-step strong{display:block;font-size:12px;color:#000;line-height:1.3}
    .request-timeline-step small{display:block;font-size:11px;line-height:1.35;margin-top:3px;color:#63666a}
    @media(max-width:760px){.request-timeline-list{grid-template-columns:1fr}.request-timeline-step{padding:4px 0 16px 34px}.request-timeline-step::before{left:8px;top:0;width:3px;height:100%}.request-timeline-step::after{left:1px;top:0}}
  `;document.head.appendChild(s);
  document.documentElement.dataset.timelineStyleBuild='2026.08.22.28';
})();
