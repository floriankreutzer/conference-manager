(function(){
  const REQUEST_KEY='conference_requests';
  const CATALOG_KEY='conference_catalog_v2';
  const SITE_KEY='conference_site_info_v1';
  const LANG_KEY='conference_language_v1';

  const pdfPack={
    de:{
      'pdf.title':'Willkommen','pdf.print':'Drucken / als PDF sichern','pdf.hero':'Schön, dass Sie dabei sind.','pdf.heroText':'Wir freuen uns auf Ihren Besuch bei „{title}“. Hier finden Sie alles, was Sie für eine entspannte Anreise und einen guten Start vor Ort benötigen.','pdf.mockTitle':'Demo-Hinweis:','pdf.mockText':'Die folgenden Standort-, Kontakt- und WLAN-Angaben sind Mock-Daten.','pdf.intro':'Damit Sie ohne Umwege ankommen, haben wir die wichtigsten Informationen kompakt für Sie zusammengestellt.','pdf.date':'Datum','pdf.time':'Uhrzeit','pdf.location':'Standort','pdf.room':'Ihr Raum','pdf.directions':'Anreise','pdf.parking':'Parken','pdf.arrival':'Ankommen & Zutritt','pdf.building':'Im Gebäude','pdf.accessibility':'Barrierefreiheit:','pdf.contact':'Kontakt vor Ort','pdf.goodToKnow':'Gut zu wissen','pdf.planTime':'Bitte planen Sie für Anmeldung und Orientierung im Gebäude etwa 15 Minuten vor Veranstaltungsbeginn ein.','pdf.help':'Für Fragen vor Ort hilft Ihnen der Empfang oder das Conference Management gerne weiter.','pdf.wifi':'Gäste-WLAN','pdf.wifiText':'Sie können sich vor Ort direkt mit dem Gäste-WLAN verbinden.','pdf.network':'Netzwerk','pdf.wifiCode':'WLAN-Code','pdf.closing':'Wir wünschen Ihnen eine angenehme Anreise und eine erfolgreiche Veranstaltung.','pdf.subclosing':'Bis bald vor Ort.','pdf.route':'Route öffnen','pdf.ask':'Bitte beim Veranstalter erfragen'
    },
    en:{
      'pdf.title':'Welcome','pdf.print':'Print / Save as PDF','pdf.hero':'Glad you’re joining us.','pdf.heroText':'We look forward to welcoming you to “{title}”. Here you’ll find everything you need for a smooth arrival and a good start on site.','pdf.mockTitle':'Demo notice:','pdf.mockText':'The following location, contact and Wi-Fi details are mock data.','pdf.intro':'To help you arrive without detours, we have summarized the key information for you.','pdf.date':'Date','pdf.time':'Time','pdf.location':'Location','pdf.room':'Your room','pdf.directions':'Directions','pdf.parking':'Parking','pdf.arrival':'Arrival & access','pdf.building':'Inside the building','pdf.accessibility':'Accessibility:','pdf.contact':'On-site contact','pdf.goodToKnow':'Good to know','pdf.planTime':'Please allow around 15 minutes before the event starts for registration and orientation in the building.','pdf.help':'Reception or Conference Management will be happy to help with any questions on site.','pdf.wifi':'Guest Wi-Fi','pdf.wifiText':'You can connect directly to the guest Wi-Fi on site.','pdf.network':'Network','pdf.wifiCode':'Wi-Fi code','pdf.closing':'We wish you a pleasant journey and a successful event.','pdf.subclosing':'See you on site.','pdf.route':'Open route','pdf.ask':'Please ask the organizer'
    }
  };
  const pack={de:pdfPack.de,en:pdfPack.en,legacy:{}};
  if(window.cmI18n)window.cmI18n.register(pack);else (window.CM_I18N_PACKS||(window.CM_I18N_PACKS=[])).push(pack);

  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const lang=()=>window.cmI18n?.language?.()||localStorage.getItem(LANG_KEY)||'de';
  const tr=(key,vars={})=>{
    if(window.cmI18n?.t){const x=window.cmI18n.t(key,vars);if(x!==key)return x}
    return String((pdfPack[lang()]||pdfPack.de)[key]||key).replace(/\{(\w+)\}/g,(_,k)=>vars[k]??'');
  };
  const source=s=>window.cmI18n?.translateSource?.(String(s??''))||String(s??'');
  const getRequests=()=>{try{return JSON.parse(localStorage.getItem(REQUEST_KEY)||'[]')}catch{return[]}};
  const getCatalog=()=>{try{return JSON.parse(localStorage.getItem(CATALOG_KEY)||'null')}catch{return null}};
  const getSite=location=>{
    try{if(typeof window.getConferenceSiteInfo==='function')return window.getConferenceSiteInfo(location)}catch(_){}
    try{return JSON.parse(localStorage.getItem(SITE_KEY)||'{}')?.[location]||{}}catch{return{}}
  };
  const fmtDate=d=>d?new Date(d+'T12:00:00').toLocaleDateString(lang()==='en'?'en-GB':'de-DE',{weekday:'long',day:'2-digit',month:'long',year:'numeric'}):'—';
  const value=(v,fallback)=>String(v||'').trim()||(fallback??tr('pdf.ask'));
  const qrUrl=v=>v?`https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=8&data=${encodeURIComponent(v)}`:'';

  function create(id){
    const request=getRequests().find(r=>r.id===id);
    if(!request||request.status!=='Confirmed')return;

    const catalog=getCatalog();
    const room=catalog?.rooms?.find(r=>r.id===request.roomId)||null;
    const location=request.location||room?.location||tr('pdf.location');
    const site=getSite(location);
    const route=site.mapsUrl||site.address||'';
    const routeQr=qrUrl(route);
    const wifiReady=String(site.wifiName||'').trim()&&String(site.wifiPassword||'').trim();
    const roomName=source(room?.name||request.roomId||'—');
    const roomFloor=source(room?.floor||'');
    const docLang=lang()==='en'?'en':'de';

    const win=window.open('','_blank');
    if(!win)return;

    win.document.open();
    win.document.write(`<!doctype html><html lang="${docLang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(tr('pdf.title'))} – ${esc(request.title)}</title><style>
      @page{size:A4;margin:12mm}
      *{box-sizing:border-box}
      body{font-family:Arial,sans-serif;color:#111;margin:0;font-size:10.5pt;line-height:1.48;background:#fff}
      .print{margin:0 0 14px;background:#000;color:#fff;border:0;padding:10px 14px;font-weight:700}
      .hero{background:#000;color:#fff;padding:28px 30px 26px;border-bottom:7px solid #C29A6B}
      .brand{font-size:12px;font-weight:700;letter-spacing:.35px}.dot{color:#C29A6B}
      .hero h1{font-size:32px;line-height:1.08;margin:24px 0 10px}.hero p{font-size:15px;line-height:1.45;margin:0;color:#e5e5e5;max-width:720px}
      .content{padding:22px 2px}.intro{font-size:14px;margin:0 0 18px;color:#333}
      .facts{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:18px}.fact{border:1px solid #d0d0ce;padding:11px;background:#fafafa}.fact small{display:block;color:#63666a}.fact strong{display:block;margin-top:4px;font-size:12px}
      .grid{display:grid;grid-template-columns:1fr 1fr;gap:11px;margin-bottom:11px}.card{border:1px solid #d0d0ce;padding:14px;break-inside:avoid}.card h2{font-size:15px;margin:0 0 9px;padding-bottom:6px;border-bottom:2px solid #C29A6B}.card p{margin:5px 0}
      .arrival{display:grid;grid-template-columns:1fr auto;gap:14px;align-items:start}.qr{width:132px;height:132px;border:1px solid #d0d0ce;padding:5px;background:#fff}.qr-caption{font-size:9px;color:#63666a;text-align:center;margin-top:4px}
      .wifi{margin-top:11px;background:#F5EEE6;border-left:5px solid #C29A6B;padding:13px;break-inside:avoid}.wifi h2{font-size:15px;margin:0 0 7px}.wifi-code{font-family:ui-monospace,Menlo,monospace;font-size:13px;font-weight:700;background:#fff;border:1px solid #d0d0ce;padding:9px;margin:8px 0}
      .closing{font-size:15px;font-weight:700;margin:20px 0 5px}.subclosing{color:#53565a;margin:0}.mock{background:#fff7e6;border-left:4px solid #f0b429;padding:9px 11px;font-size:9pt;margin-bottom:14px}
      @media print{.print{display:none}}@media(max-width:650px){.facts{grid-template-columns:1fr 1fr}.grid{grid-template-columns:1fr}.arrival{grid-template-columns:1fr}.qr{width:150px;height:150px}}
    </style></head><body>
      <button class="print" onclick="window.print()">${esc(tr('pdf.print'))}</button>
      <section class="hero"><div class="brand">Conference Manager <span class="dot">.</span></div><h1>${esc(tr('pdf.hero'))}</h1><p>${esc(tr('pdf.heroText',{title:request.title}))}</p></section>
      <div class="content">
        ${site.mockData?`<div class="mock"><strong>${esc(tr('pdf.mockTitle'))}</strong> ${esc(tr('pdf.mockText'))}</div>`:''}
        <p class="intro">${esc(tr('pdf.intro'))}</p>
        <div class="facts">
          <div class="fact"><small>${esc(tr('pdf.date'))}</small><strong>${esc(fmtDate(request.date))}</strong></div>
          <div class="fact"><small>${esc(tr('pdf.time'))}</small><strong>${esc(request.start)}–${esc(request.end)}</strong></div>
          <div class="fact"><small>${esc(tr('pdf.location'))}</small><strong>${esc(location)}</strong></div>
          <div class="fact"><small>${esc(tr('pdf.room'))}</small><strong>${esc(roomName)}${roomFloor?` · ${esc(roomFloor)}`:''}</strong></div>
        </div>

        <div class="grid">
          <section class="card"><h2>${esc(tr('pdf.directions'))}</h2><div class="arrival"><div><p><strong>${esc(value(site.address))}</strong></p><p>${esc(value(site.publicTransport,''))}</p><p>${esc(value(site.carArrival,''))}</p></div>${routeQr?`<div><img class="qr" src="${routeQr}" alt="QR code"><div class="qr-caption">${esc(tr('pdf.route'))}</div></div>`:''}</div></section>
          <section class="card"><h2>${esc(tr('pdf.parking'))}</h2><p>${esc(value(site.parking))}</p></section>
        </div>

        <div class="grid">
          <section class="card"><h2>${esc(tr('pdf.arrival'))}</h2><p>${esc(value(site.reception))}</p>${site.visitorNotes?`<p>${esc(site.visitorNotes)}</p>`:''}</section>
          <section class="card"><h2>${esc(tr('pdf.building'))}</h2><p>${esc(value(site.building))}</p>${site.accessibility?`<p><strong>${esc(tr('pdf.accessibility'))}</strong> ${esc(site.accessibility)}</p>`:''}</section>
        </div>

        <div class="grid">
          <section class="card"><h2>${esc(tr('pdf.contact'))}</h2><p><strong>${esc(value(site.contact,'Conference Management'))}</strong></p>${site.contactDetails?`<p>${esc(site.contactDetails)}</p>`:''}</section>
          <section class="card"><h2>${esc(tr('pdf.goodToKnow'))}</h2><p>${esc(tr('pdf.planTime'))}</p><p>${esc(tr('pdf.help'))}</p></section>
        </div>

        ${wifiReady?`<section class="wifi"><h2>${esc(tr('pdf.wifi'))}</h2><p>${esc(tr('pdf.wifiText'))}</p><div class="wifi-code">${esc(tr('pdf.network'))}: ${esc(site.wifiName)}<br>${esc(tr('pdf.wifiCode'))}: ${esc(site.wifiPassword)}</div>${site.wifiInstructions?`<p>${esc(site.wifiInstructions)}</p>`:''}</section>`:''}

        <p class="closing">${esc(tr('pdf.closing'))}</p>
        <p class="subclosing">${esc(tr('pdf.subclosing'))}</p>
      </div>
    </body></html>`);
    win.document.close();
    setTimeout(()=>{try{win.focus();win.print()}catch(_){}},450);
  }

  window.createConferenceWelcomePdfV2=create;
  document.documentElement.dataset.welcomePdfBuild='2026.08.22.26';
})();