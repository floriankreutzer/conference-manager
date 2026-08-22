(function(){
  const KEY='conference_language_v1';
  const q=(s,r=document)=>r.querySelector(s),qa=(s,r=document)=>Array.from(r.querySelectorAll(s));
  let queued=false;
  const exact={
    'Montag':'Monday','Dienstag':'Tuesday','Mittwoch':'Wednesday','Donnerstag':'Thursday','Freitag':'Friday','Samstag':'Saturday','Sonntag':'Sunday',
    'Januar':'January','Februar':'February','März':'March','April':'April','Mai':'May','Juni':'June','Juli':'July','August':'August','September':'September','Oktober':'October','November':'November','Dezember':'December',
    'Besondere Anforderungen':'Special requirements','Catering-Details':'Catering details','Keine Ernährungs- oder Unverträglichkeitsangaben':'No dietary or intolerance information','Anfrage stornieren?':'Cancel request?','Die Raumreservierung wird freigegeben.':'The room reservation will be released.','Buchungsverlauf':'Booking history','alle Anfragen':'all requests',
    'Die bisherigen Angaben wurden übernommen. Prüfen Sie insbesondere Termin, Raum und Teilnehmerzahl vor dem Absenden.':'The previous details have been copied. Please review the schedule, room and participant count before submitting.',
    'Angaben wurden in eine neue Anfrage übernommen.':'Details were copied into a new request.','Für Ihre Veranstaltung empfohlen':'Recommended for your event','Sinnvoll bei externen Gästen':'Useful for external guests','Sinnvoll mit Catering':'Useful with catering','Geeignet für hybride Veranstaltungen':'Suitable for hybrid events','Geeignet für technisch anspruchsvolle Meetings':'Suitable for technically demanding meetings'
  };
  function en(){return (localStorage.getItem(KEY)||'de')==='en'}
  function dynamic(s){
    return s.replace(/^Willkommen,\s*(.+)\.$/,'Welcome, $1.')
      .replace(/^Neue Anfrage auf Basis von\s+(CR-[^\s]+)$/,'New request based on $1')
      .replace(/^(\d+) Aktion erforderlich$/,'$1 action required')
      .replace(/^(\d+) Aktionen erforderlich$/,'$1 actions required')
      .replace(/ · alle Anfragen$/,' · all requests')
      .replace(/Raumreservierung wird freigegeben\./g,'room reservation will be released.');
  }
  function apply(){
    if(!en())return;
    const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT,{acceptNode:n=>{const p=n.parentElement;if(!p||['SCRIPT','STYLE','NOSCRIPT'].includes(p.tagName))return NodeFilter.FILTER_REJECT;return NodeFilter.FILTER_ACCEPT}});let n;while(n=w.nextNode()){const raw=n.nodeValue;if(!raw||!raw.trim())continue;const core=raw.trim(),out=exact[core]||dynamic(core);if(out!==core){const a=raw.match(/^\s*/)?.[0]||'',b=raw.match(/\s*$/)?.[0]||'';n.nodeValue=a+out+b}}
    qa('[aria-label]').forEach(el=>{const v=el.getAttribute('aria-label');if(v==='Buchungsverlauf')el.setAttribute('aria-label','Booking history')});
  }
  function schedule(){if(queued)return;queued=true;setTimeout(()=>{queued=false;apply()},70)}
  function init(){apply();document.addEventListener('click',schedule,true);window.addEventListener('conference-request-updated',schedule);window.addEventListener('conference-edit-loaded',schedule);document.documentElement.dataset.i18nDynamicBuild='2026.08.22.25'}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
