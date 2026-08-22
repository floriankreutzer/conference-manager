(function () {
  const SITE_KEY = 'conference_site_info_v1';
  const CATALOG_KEY = 'conference_catalog_v2';
  const MOCK_VERSION = 2;

  const qs = id => document.getElementById(id);
  const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));

  function emptySite(name) {
    return {name,address:'',publicTransport:'',carArrival:'',parking:'',reception:'',building:'',visitorNotes:'',accessibility:'',contact:'',contactDetails:'',mapsUrl:'',mockData:false,mockVersion:0};
  }

  const defaults = {
    Berlin: {
      ...emptySite('Berlin'), mockData:true, mockVersion:MOCK_VERSION,
      address:'Musterallee 24, 10115 Berlin (Mock-Adresse)',
      publicTransport:'Vom Berliner Hauptbahnhof mit der S-Bahn bis Friedrichstraße, anschließend ca. 7 Minuten zu Fuß. Alternativ Buslinie M41 bis Haltestelle Musterallee. Bitte ca. 10 Minuten zusätzliche Zeit einplanen. (Mock)',
      carArrival:'Anfahrt über Invalidenstraße, anschließend der Beschilderung „Besucher / Conference Center“ folgen. Für Navigationssysteme bitte die Musterallee 24 verwenden. (Mock)',
      parking:'Besucherparkplätze P2 in der Tiefgarage. Einfahrt über Musterstraße 8. Parkticket am Empfang validieren lassen; Einfahrtshöhe 2,00 m. (Mock)',
      reception:'Bitte am Besucherempfang im Erdgeschoss anmelden und einen Lichtbildausweis bereithalten. Der Veranstaltungsname bzw. die Buchungsnummer genügt zur Zuordnung. (Mock)',
      building:'Nach dem Empfang geradeaus zu Aufzugskern B. Räume im 3. und 4. OG sind über Aufzug B erreichbar; das Auditorium liegt im Erdgeschoss links hinter dem Conference Desk. (Mock)',
      visitorNotes:'Externe Gäste sollten ca. 15 Minuten vor Veranstaltungsbeginn eintreffen. Besucherausweise sind während des Aufenthalts sichtbar zu tragen. (Mock)',
      accessibility:'Stufenloser Zugang über Haupteingang und Tiefgarage; Aufzüge zu allen Konferenzetagen. Barrierefreies WC im Erdgeschoss. (Mock)',
      contact:'Conference Desk Berlin',
      contactDetails:'+49 30 555 0100 · conference.berlin@example.test',
      mapsUrl:'https://example.test/route/berlin'
    },
    Stuttgart: {
      ...emptySite('Stuttgart'), mockData:true, mockVersion:MOCK_VERSION,
      address:'Beispielstraße 88, 70565 Stuttgart (Mock-Adresse)',
      publicTransport:'Ab Stuttgart Hauptbahnhof mit der S-Bahn bis Vaihingen. Von dort Bus 81 bis „Business Campus“. Der Haupteingang liegt gegenüber der Haltestelle. (Mock)',
      carArrival:'Über A8/A831 Richtung Stuttgart-Vaihingen, Ausfahrt „Business Campus“. Am Kreisverkehr die zweite Ausfahrt zum Besucherzentrum nehmen. (Mock)',
      parking:'Besucherparkhaus P1, Zufahrt Beispielstraße 90. Vorabregistrierte Gäste erhalten die Ausfahrtfreigabe am Empfang. E-Ladepunkte auf Ebene -1. (Mock)',
      reception:'Anmeldung am Welcome Desk in Gebäude A. Bitte Buchungsnummer oder Namen der Veranstaltung nennen. Für externe Gäste wird dort ein Besucherausweis ausgegeben. (Mock)',
      building:'Vom Welcome Desk durch die Glaspassage zum Konferenzbereich. Raum 2.01 liegt im 2. OG, das Atrium direkt im Erdgeschoss hinter der Passage. (Mock)',
      visitorNotes:'Für größere Gruppen empfiehlt sich eine gemeinsame Ankunft 20 Minuten vor Beginn. Garderoben befinden sich neben dem Welcome Desk. (Mock)',
      accessibility:'Barrierefreier Eingang an Gebäude A, Aufzug zu allen Etagen, reservierte Stellplätze direkt neben dem Haupteingang. (Mock)',
      contact:'Visitor & Conference Services Stuttgart',
      contactDetails:'+49 711 555 0200 · conference.stuttgart@example.test',
      mapsUrl:'https://example.test/route/stuttgart'
    },
    Frankfurt: {
      ...emptySite('Frankfurt'), mockData:true, mockVersion:MOCK_VERSION,
      address:'Demoplatz 5, 60313 Frankfurt am Main (Mock-Adresse)',
      publicTransport:'Vom Frankfurt Hauptbahnhof mit U4/U5 bis Willy-Brandt-Platz, danach ca. 8 Minuten zu Fuß Richtung Demoplatz. (Mock)',
      carArrival:'Über Mainzer Landstraße Richtung Innenstadt und anschließend der Beschilderung „Visitor Parking“ folgen. Die Zufahrt befindet sich in der Seitenstraße Demo-Gasse. (Mock)',
      parking:'Besucherstellplätze im Parkdeck P3. Kennzeichen bitte beim Empfang angeben; die ersten 10 Minuten dienen der Einfahrt und Anmeldung. (Mock)',
      reception:'Der Besucherempfang befindet sich im Foyer des Hauptgebäudes. Bitte Lichtbildausweis und Veranstaltungsnamen bereithalten. (Mock)',
      building:'Nach dem Empfang rechts zu den Aufzügen C. Raum 1.05 befindet sich im 1. OG; der Weg ist zusätzlich mit „Conference“ ausgeschildert. (Mock)',
      visitorNotes:'Bitte keine vertraulichen Unterlagen unbeaufsichtigt im Empfangsbereich lassen. WLAN-Zugangsdaten werden im Raum bereitgestellt. (Mock)',
      accessibility:'Stufenloser Haupteingang, barrierefreier Aufzug C und barrierefreies WC im 1. OG. (Mock)',
      contact:'Conference Services Frankfurt',
      contactDetails:'+49 69 555 0300 · conference.frankfurt@example.test',
      mapsUrl:'https://example.test/route/frankfurt'
    }
  };

  function getCatalog(){try{return JSON.parse(localStorage.getItem(CATALOG_KEY)||'null')}catch{return null}}
  function knownLocations(){const fromCatalog=getCatalog()?.rooms?.map(r=>r.location).filter(Boolean)||[];return [...new Set([...Object.keys(defaults),...fromCatalog])].sort()}

  function loadAll(){
    let data={}; try{data=JSON.parse(localStorage.getItem(SITE_KEY)||'{}')||{}}catch{data={}}
    let changed=false;
    knownLocations().forEach(location=>{
      const current=data[location];
      const def=defaults[location]||emptySite(location);
      if(!current){data[location]={...def};changed=true;return}
      if((current.mockData===true || !String(current.address||'').trim()) && Number(current.mockVersion||0)<MOCK_VERSION && defaults[location]){
        data[location]={...def};changed=true;return
      }
      const merged={...emptySite(location),...current,name:location};
      if(JSON.stringify(merged)!==JSON.stringify(current))changed=true;
      data[location]=merged;
    });
    if(changed)localStorage.setItem(SITE_KEY,JSON.stringify(data));
    return data;
  }
  function saveAll(data){localStorage.setItem(SITE_KEY,JSON.stringify(data))}
  function getSite(location){const data=loadAll();return data[location]||emptySite(location||'Standort')}
  window.getConferenceSiteInfo=getSite;

  function injectStyles(){if(qs('siteInfoStyles'))return;const style=document.createElement('style');style.id='siteInfoStyles';style.textContent=`
    .site-editor{display:grid;gap:16px}.site-card{border:1px solid #d0d0ce;background:#fafafa;padding:18px}.site-card h3{margin:0 0 4px}.site-card .site-sub{margin:0 0 16px;color:#63666a}.site-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.site-fields .wide{grid-column:1/-1}.site-fields textarea{min-height:86px}.site-status{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}.site-status span{font-size:12px;padding:5px 8px;background:#ededed;color:#53565a}.site-status span.ok{background:#eef7df;color:#046a38;border-left:3px solid #86bc25}.mock-badge{display:inline-flex;margin-left:8px;padding:3px 6px;background:#fff7e6;color:#8a5500;font-size:11px;font-weight:700;border-left:3px solid #f0b429}@media(max-width:760px){.site-fields{grid-template-columns:1fr}.site-fields .wide{grid-column:auto}}`;
    document.head.appendChild(style)}
  function ensureTab(){const nav=document.querySelector('.catalog-nav');if(!nav||nav.querySelector('[data-catalog-tab="sites"]'))return;const btn=document.createElement('button');btn.type='button';btn.className='catalog-tab';btn.dataset.catalogTab='sites';btn.textContent='Standorte';nav.appendChild(btn)}
  function field(id,label,value,cls=''){return `<label class="${cls}"><span>${label}</span><input id="${id}" value="${esc(value)}"></label>`}
  function textarea(id,label,value,cls=''){return `<label class="${cls}"><span>${label}</span><textarea id="${id}">${esc(value)}</textarea></label>`}
  function completeness(site){const required=['address','publicTransport','carArrival','parking','reception','building','contact'];const filled=required.filter(k=>String(site[k]||'').trim()).length;return{filled,total:required.length,complete:filled===required.length}}
  function slug(value){return String(value).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')}

  function renderEditor(){
    const editor=qs('catalogEditor');if(!editor)return;qsa('[data-catalog-tab]').forEach(b=>b.classList.toggle('active',b.dataset.catalogTab==='sites'));try{if(typeof state!=='undefined')state.catalogTab='sites'}catch(_){}
    const data=loadAll();editor.innerHTML=`<div class="info-box">Diese Angaben werden automatisch in Buchungsdetails und Willkommens-PDF verwendet. Die vorbefüllten Werte sind ausschließlich Mock-Daten.</div><div class="site-editor">${knownLocations().map(location=>{const s=data[location],c=completeness(s);return `<div class="site-card" data-site-card="${esc(location)}"><h3>${esc(location)}${s.mockData?'<span class="mock-badge">MOCK</span>':''}</h3><p class="site-sub">Standortinformationen für interne und externe Gäste.</p><div class="site-fields">${field(`site-address-${slug(location)}`,'Adresse',s.address,'wide')}${textarea(`site-public-${slug(location)}`,'ÖPNV-Anfahrt',s.publicTransport)}${textarea(`site-car-${slug(location)}`,'PKW-Anfahrt',s.carArrival)}${textarea(`site-parking-${slug(location)}`,'Parken',s.parking)}${textarea(`site-reception-${slug(location)}`,'Empfang / Zutritt',s.reception)}${textarea(`site-building-${slug(location)}`,'Im Gebäude / Weg zum Raum',s.building,'wide')}${textarea(`site-visitor-${slug(location)}`,'Hinweise für Besucher',s.visitorNotes)}${textarea(`site-access-${slug(location)}`,'Barrierefreiheit',s.accessibility)}${field(`site-contact-${slug(location)}`,'Ansprechpartner / Funktion',s.contact)}${field(`site-contactdetails-${slug(location)}`,'Kontakt (Telefon / E-Mail)',s.contactDetails)}${field(`site-maps-${slug(location)}`,'Maps-/Routen-Link',s.mapsUrl,'wide')}</div><div class="site-status"><span class="${c.complete?'ok':''}">${c.filled}/${c.total} Kernangaben gepflegt</span></div><div class="catalog-actions"><button type="button" class="primary" data-site-save="${esc(location)}">Standort speichern</button></div></div>`}).join('')}</div>`
  }

  function saveSite(location){const data=loadAll(),id=slug(location);data[location]={name:location,address:qs(`site-address-${id}`)?.value.trim()||'',publicTransport:qs(`site-public-${id}`)?.value.trim()||'',carArrival:qs(`site-car-${id}`)?.value.trim()||'',parking:qs(`site-parking-${id}`)?.value.trim()||'',reception:qs(`site-reception-${id}`)?.value.trim()||'',building:qs(`site-building-${id}`)?.value.trim()||'',visitorNotes:qs(`site-visitor-${id}`)?.value.trim()||'',accessibility:qs(`site-access-${id}`)?.value.trim()||'',contact:qs(`site-contact-${id}`)?.value.trim()||'',contactDetails:qs(`site-contactdetails-${id}`)?.value.trim()||'',mapsUrl:qs(`site-maps-${id}`)?.value.trim()||'',mockData:false,mockVersion:MOCK_VERSION};saveAll(data);renderEditor();try{if(typeof toast==='function')toast(`${location}: Standortinformationen gespeichert.`)}catch(_){}}

  document.addEventListener('click',e=>{const tab=e.target.closest('[data-catalog-tab="sites"]');if(tab){e.preventDefault();e.stopImmediatePropagation();renderEditor();return}const save=e.target.closest('[data-site-save]');if(save){e.preventDefault();e.stopImmediatePropagation();saveSite(save.dataset.siteSave)}},true);
  function init(){injectStyles();loadAll();ensureTab();const nav=document.querySelector('.catalog-nav');if(nav&&!nav.__siteObserver){const observer=new MutationObserver(ensureTab);observer.observe(nav,{childList:true});nav.__siteObserver=true}}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();