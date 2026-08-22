(function(){
  const REQUEST_KEY='conference_requests';
  const CATALOG_KEY='conference_catalog_v2';
  const SITE_KEY='conference_site_info_v1';

  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const getRequests=()=>{try{return JSON.parse(localStorage.getItem(REQUEST_KEY)||'[]')}catch{return[]}};
  const getCatalog=()=>{try{return JSON.parse(localStorage.getItem(CATALOG_KEY)||'null')}catch{return null}};
  const getSite=location=>{
    try{if(typeof window.getConferenceSiteInfo==='function')return window.getConferenceSiteInfo(location)}catch(_){}
    try{return JSON.parse(localStorage.getItem(SITE_KEY)||'{}')?.[location]||{}}catch{return{}}
  };
  const fmtDate=d=>d?new Date(d+'T12:00:00').toLocaleDateString('de-DE',{weekday:'long',day:'2-digit',month:'long',year:'numeric'}):'—';
  const value=(v,fallback='Bitte beim Veranstalter erfragen')=>String(v||'').trim()||fallback;
  const qrUrl=v=>v?`https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=8&data=${encodeURIComponent(v)}`:'';

  function create(id){
    const request=getRequests().find(r=>r.id===id);
    if(!request||request.status!=='Confirmed')return;

    const catalog=getCatalog();
    const room=catalog?.rooms?.find(r=>r.id===request.roomId)||null;
    const location=request.location||room?.location||'Standort';
    const site=getSite(location);
    const route=site.mapsUrl||site.address||'';
    const routeQr=qrUrl(route);
    const wifiReady=String(site.wifiName||'').trim()&&String(site.wifiPassword||'').trim();

    const win=window.open('','_blank');
    if(!win)return;

    win.document.open();
    win.document.write(`<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Willkommen – ${esc(request.title)}</title><style>
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
      <button class="print" onclick="window.print()">Drucken / als PDF sichern</button>
      <section class="hero"><div class="brand">Conference Manager <span class="dot">.</span></div><h1>Schön, dass Sie dabei sind.</h1><p>Wir freuen uns auf Ihren Besuch bei „${esc(request.title)}“. Hier finden Sie alles, was Sie für eine entspannte Anreise und einen guten Start vor Ort benötigen.</p></section>
      <div class="content">
        ${site.mockData?'<div class="mock"><strong>Demo-Hinweis:</strong> Die folgenden Standort-, Kontakt- und WLAN-Angaben sind Mock-Daten.</div>':''}
        <p class="intro">Damit Sie ohne Umwege ankommen, haben wir die wichtigsten Informationen kompakt für Sie zusammengestellt.</p>
        <div class="facts">
          <div class="fact"><small>Datum</small><strong>${fmtDate(request.date)}</strong></div>
          <div class="fact"><small>Uhrzeit</small><strong>${esc(request.start)}–${esc(request.end)}</strong></div>
          <div class="fact"><small>Standort</small><strong>${esc(location)}</strong></div>
          <div class="fact"><small>Ihr Raum</small><strong>${esc(room?.name||request.roomId||'—')}${room?.floor?` · ${esc(room.floor)}`:''}</strong></div>
        </div>

        <div class="grid">
          <section class="card"><h2>Anreise</h2><div class="arrival"><div><p><strong>${esc(value(site.address))}</strong></p><p>${esc(value(site.publicTransport,''))}</p><p>${esc(value(site.carArrival,''))}</p></div>${routeQr?`<div><img class="qr" src="${routeQr}" alt="QR-Code zur Route"><div class="qr-caption">Route öffnen</div></div>`:''}</div></section>
          <section class="card"><h2>Parken</h2><p>${esc(value(site.parking))}</p></section>
        </div>

        <div class="grid">
          <section class="card"><h2>Ankommen & Zutritt</h2><p>${esc(value(site.reception))}</p>${site.visitorNotes?`<p>${esc(site.visitorNotes)}</p>`:''}</section>
          <section class="card"><h2>Im Gebäude</h2><p>${esc(value(site.building))}</p>${site.accessibility?`<p><strong>Barrierefreiheit:</strong> ${esc(site.accessibility)}</p>`:''}</section>
        </div>

        <div class="grid">
          <section class="card"><h2>Kontakt vor Ort</h2><p><strong>${esc(value(site.contact,'Conference Management'))}</strong></p>${site.contactDetails?`<p>${esc(site.contactDetails)}</p>`:''}</section>
          <section class="card"><h2>Gut zu wissen</h2><p>Bitte planen Sie für Anmeldung und Orientierung im Gebäude etwa 15 Minuten vor Veranstaltungsbeginn ein.</p><p>Für Fragen vor Ort hilft Ihnen der Empfang oder das Conference Management gerne weiter.</p></section>
        </div>

        ${wifiReady?`<section class="wifi"><h2>Gäste-WLAN</h2><p>Sie können sich vor Ort direkt mit dem Gäste-WLAN verbinden.</p><div class="wifi-code">Netzwerk: ${esc(site.wifiName)}<br>WLAN-Code: ${esc(site.wifiPassword)}</div>${site.wifiInstructions?`<p>${esc(site.wifiInstructions)}</p>`:''}</section>`:''}

        <p class="closing">Wir wünschen Ihnen eine angenehme Anreise und eine erfolgreiche Veranstaltung.</p>
        <p class="subclosing">Bis bald vor Ort.</p>
      </div>
    </body></html>`);
    win.document.close();
    setTimeout(()=>{try{win.focus();win.print()}catch(_){}},450);
  }

  window.createConferenceWelcomePdfV2=create;
})();