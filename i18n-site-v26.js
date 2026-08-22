(function(){
 const de={},en={},legacy={};const rows=[
  ['floor.eg','EG','Ground floor'],['floor.1','1. OG','1st floor'],['floor.2','2. OG','2nd floor'],['floor.3','3. OG','3rd floor'],['floor.4','4. OG','4th floor'],['floor.none','Etage nicht hinterlegt','Floor not provided'],['floor.na','Etage n/a','Floor n/a'],['equip.none','Keine Ausstattungsinformationen','No equipment information'],['equip.none2','Keine Angaben','No information'],['site.mockAddress','Mock-Adresse','mock address'],['site.mock','(Mock)','(Mock)']
 ];for(const [k,d,e] of rows){de[k]=d;en[k]=e;legacy[d]=k}
 const placeholders={
  'z. B. Management Workshop':{de:'z. B. Management Workshop',en:'e.g. Management workshop'},'Anzahl eingeben':{de:'Anzahl eingeben',en:'Enter number'},'Bitte Standort auswählen':{de:'Bitte Standort auswählen',en:'Select location'},'z. B. U-Bestuhlung, Vorbereitung ab 08:30, besondere Zugangsanforderungen':{de:'z. B. U-Bestuhlung, Vorbereitung ab 08:30, besondere Zugangsanforderungen',en:'e.g. U-shape seating, preparation from 08:30, special access requirements'},'z. B. 2× vegan, 1× glutenfrei':{de:'z. B. 2× vegan, 1× glutenfrei',en:'e.g. 2× vegan, 1× gluten-free'},'Kostenstelle':{de:'Kostenstelle',en:'Cost center'},'Ihre Frage oder Ihr Anliegen':{de:'Ihre Frage oder Ihr Anliegen',en:'Your question or request'},'Titel oder Buchungsnummer':{de:'Titel oder Buchungsnummer',en:'Title or booking number'}
 };
 (window.CM_I18N_PACKS||(window.CM_I18N_PACKS=[])).push({de,en,legacy,placeholders});
 const map={
  'Musterallee 24, 10115 Berlin (Mock-Adresse)':'Musterallee 24, 10115 Berlin (mock address)',
  'Vom Berliner Hauptbahnhof mit der S-Bahn bis Friedrichstraße, anschließend ca. 7 Minuten zu Fuß. Alternativ Buslinie M41 bis Haltestelle Musterallee. (Mock)':'From Berlin Central Station take the S-Bahn to Friedrichstraße, then walk about 7 minutes. Alternatively, take bus M41 to Musterallee. (Mock)',
  'Anfahrt über Invalidenstraße, anschließend der Beschilderung „Besucher / Conference Center“ folgen. (Mock)':'Approach via Invalidenstraße, then follow signs for “Visitors / Conference Center”. (Mock)',
  'Besucherparkplätze P2 in der Tiefgarage, Einfahrt Musterstraße 8. Parkticket am Empfang validieren lassen. (Mock)':'Visitor parking P2 is in the underground garage, entrance at Musterstraße 8. Have the parking ticket validated at reception. (Mock)',
  'Bitte am Besucherempfang im Erdgeschoss anmelden und einen Lichtbildausweis bereithalten. (Mock)':'Please register at visitor reception on the ground floor and have a photo ID ready. (Mock)',
  'Nach dem Empfang geradeaus zu Aufzugskern B. Räume im 3. und 4. OG sind über Aufzug B erreichbar; das Auditorium liegt im Erdgeschoss links hinter dem Conference Desk. (Mock)':'From reception, continue straight to elevator core B. Rooms on the 3rd and 4th floors are accessible via elevator B; the auditorium is on the ground floor to the left behind the Conference Desk. (Mock)',
  'Externe Gäste sollten ca. 15 Minuten vor Veranstaltungsbeginn eintreffen. (Mock)':'External guests should arrive about 15 minutes before the event starts. (Mock)',
  'Stufenloser Zugang, Aufzüge zu allen Konferenzetagen und barrierefreies WC im Erdgeschoss. (Mock)':'Step-free access, elevators to all conference floors and an accessible restroom on the ground floor. (Mock)',
  'Netzwerk auswählen, WLAN-Code eingeben und die Nutzungsbedingungen im Browser bestätigen. (Mock)':'Select the network, enter the Wi-Fi code and accept the terms of use in your browser. (Mock)',
  'Beispielstraße 88, 70565 Stuttgart (Mock-Adresse)':'Beispielstraße 88, 70565 Stuttgart (mock address)',
  'Ab Stuttgart Hauptbahnhof mit der S-Bahn bis Vaihingen. Von dort Bus 81 bis „Business Campus“. (Mock)':'From Stuttgart Central Station take the S-Bahn to Vaihingen, then bus 81 to “Business Campus”. (Mock)',
  'Über A8/A831 Richtung Stuttgart-Vaihingen, Ausfahrt „Business Campus“. (Mock)':'Take the A8/A831 toward Stuttgart-Vaihingen and use the “Business Campus” exit. (Mock)',
  'Besucherparkhaus P1, Zufahrt Beispielstraße 90. E-Ladepunkte auf Ebene -1. (Mock)':'Visitor parking garage P1, access via Beispielstraße 90. EV charging points are available on level -1. (Mock)',
  'Anmeldung am Welcome Desk in Gebäude A. Bitte Buchungsnummer oder Veranstaltungsnamen nennen. (Mock)':'Register at the Welcome Desk in Building A. Please provide the booking number or event name. (Mock)',
  'Vom Welcome Desk durch die Glaspassage zum Konferenzbereich. Raum 2.01 liegt im 2. OG, das Atrium direkt im Erdgeschoss. (Mock)':'From the Welcome Desk, take the glass walkway to the conference area. Room 2.01 is on the 2nd floor; the atrium is directly on the ground floor. (Mock)',
  'Für größere Gruppen empfiehlt sich eine gemeinsame Ankunft 20 Minuten vor Beginn. (Mock)':'For larger groups, arriving together 20 minutes before the start is recommended. (Mock)',
  'Barrierefreier Eingang an Gebäude A, Aufzug zu allen Etagen, reservierte Stellplätze am Haupteingang. (Mock)':'Accessible entrance at Building A, elevator to all floors and reserved parking spaces at the main entrance. (Mock)',
  'Mit GuestConnect-STR verbinden und den WLAN-Code eingeben. Das Gastnetz trennt die Verbindung nach 12 Stunden automatisch. (Mock)':'Connect to GuestConnect-STR and enter the Wi-Fi code. The guest network disconnects automatically after 12 hours. (Mock)',
  'Demoplatz 5, 60313 Frankfurt am Main (Mock-Adresse)':'Demoplatz 5, 60313 Frankfurt am Main (mock address)',
  'Vom Frankfurt Hauptbahnhof mit U4/U5 bis Willy-Brandt-Platz, danach ca. 8 Minuten zu Fuß Richtung Demoplatz. (Mock)':'From Frankfurt Central Station take U4/U5 to Willy-Brandt-Platz, then walk about 8 minutes toward Demoplatz. (Mock)',
  'Über Mainzer Landstraße Richtung Innenstadt und anschließend der Beschilderung „Visitor Parking“ folgen. (Mock)':'Approach via Mainzer Landstraße toward the city center and follow signs for “Visitor Parking”. (Mock)',
  'Besucherstellplätze im Parkdeck P3. Kennzeichen bitte beim Empfang angeben. (Mock)':'Visitor spaces are available in parking deck P3. Please provide your license plate number at reception. (Mock)',
  'Der Besucherempfang befindet sich im Foyer des Hauptgebäudes. Bitte Lichtbildausweis und Veranstaltungsnamen bereithalten. (Mock)':'Visitor reception is located in the lobby of the main building. Please have a photo ID and the event name ready. (Mock)',
  'Nach dem Empfang rechts zu den Aufzügen C. Raum 1.05 befindet sich im 1. OG. (Mock)':'After reception, turn right to elevators C. Room 1.05 is on the 1st floor. (Mock)',
  'WLAN-Zugangsdaten und weitere Hinweise werden im Raum bereitgestellt. (Mock)':'Wi-Fi credentials and additional information will be provided in the room. (Mock)',
  'Stufenloser Haupteingang, barrierefreier Aufzug C und barrierefreies WC im 1. OG. (Mock)':'Step-free main entrance, accessible elevator C and an accessible restroom on the 1st floor. (Mock)',
  'Gastnetz auswählen und mit dem WLAN-Code verbinden. Bei Problemen hilft der Conference Desk. (Mock)':'Select the guest network and connect using the Wi-Fi code. The Conference Desk can help if you have any issues. (Mock)'
 };
 function translateSite(s){if(!s||window.cmI18n?.language()!=='en')return s;const out={...s};for(const k of ['address','publicTransport','carArrival','parking','reception','building','visitorNotes','accessibility','wifiInstructions'])if(map[out[k]])out[k]=map[out[k]];return out}
 function patch(){if(typeof window.getConferenceSiteInfo!=='function'||window.getConferenceSiteInfo.__i18n26)return;const old=window.getConferenceSiteInfo;window.getConferenceSiteInfo=function(loc){return translateSite(old(loc))};window.getConferenceSiteInfo.__i18n26=true}
 function init(){patch();setTimeout(patch,80);document.documentElement.dataset.i18nSiteBuild='2026.08.22.26'}
 document.readyState==='loading'?document.addEventListener('DOMContentLoaded',init,{once:true}):init();
})();
