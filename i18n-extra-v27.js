(function(){
  const rows=[
    ['validation.percentRange','Jeder Kostenanteil muss zwischen 0 % und 100 % liegen.','Each cost allocation must be between 0% and 100%.'],
    ['services.hostHelp','Hilft bei Empfang, Orientierung und Gästebetreuung.','Helps with reception, orientation and guest support.'],
    ['services.avHelp','Sinnvoll bei Video, Präsentationen oder komplexerer Veranstaltungstechnik.','Useful for video, presentations or more complex event technology.'],
    ['services.itHelp','Zusätzliche Absicherung für Meeting- und Präsentationstechnik.','Additional support for meeting and presentation technology.'],
    ['services.staffHelp','Unterstützt Ausgabe, Betreuung und Raumservice während der Veranstaltung.','Supports serving, guest care and room service during the event.'],
    ['timeline.title','Buchungsverlauf','Booking history'],['timeline.sent','Anfrage gesendet','Request submitted'],['timeline.recorded','Erfasst','Recorded'],['timeline.provisional','Vorläufig reserviert','Provisionally reserved'],['timeline.held','Raum tentative gehalten','Room held provisionally'],['timeline.released','Reservierung freigegeben','Reservation released'],['timeline.review','Manager-Prüfung','Conference Management review'],['timeline.processed','Bearbeitet','Processed'],['timeline.pending','Entscheidung offen','Decision pending'],['timeline.current','Aktueller Stand','Current status'],['timeline.open','Noch offen','Still open'],
    ['change.reasonTitle','Begründung','Reason'],['change.reasonLabel','Begründung *','Reason *'],['change.reasonPlaceholder','Konkreten Hinweis für den Mitarbeiter beschreiben','Describe the requested change for the employee'],['change.editTitle','Anfrage ändern','Edit request'],['change.last','Letzte Änderungsanforderung','Latest change request'],['change.submitted','Änderung eingereicht','Changes submitted'],
    ['notification.received','Anfrage eingegangen','Request received'],['notification.confirmed','Buchung bestätigt','Booking confirmed'],['notification.change','Änderung angefordert','Change requested'],['notification.rejected','Anfrage abgelehnt','Request rejected'],['notification.cancelled','Anfrage storniert','Request cancelled'],['notification.sent','Nachricht gesendet','Message sent'],
    ['help.show','Hilfe anzeigen','Show help'],['help.mvp','Im MVP wird die Nachricht lokal simuliert. Produktiv wird hier der zuständige interne Kontakt angebunden.','In the MVP, the message is simulated locally. In production, the responsible internal contact will be connected here.'],['help.sentMvp','Ihre Nachricht an das Conference Management wurde im MVP simuliert.','Your message to Conference Management was simulated in the MVP.'],['help.toastMvp','Nachricht im MVP gesendet.','Message sent in the MVP.'],
    ['details.calendarStatus','Kalenderstatus','Calendar status'],['details.reception','Empfang','Reception'],['details.contactLabel','Kontakt','Contact'],['details.note','Hinweis','Note'],['details.mockSite','Aktuell sind Mock-Standortdaten hinterlegt.','Mock location data is currently configured.'],['details.reservation','Reservierung','Reservation'],['details.plannedFor','Für {count} Personen geplant.','Planned for {count} people.'],
    ['manager.notes','Hinweise','Notes'],['manager.dietary','Ernährung','Dietary requirements'],['manager.change','Änderung','Change'],['manager.rejectionReason','Ablehnungsgrund','Reason for rejection'],
    ['draft.autosaved','Entwurf automatisch gespeichert','Draft autosaved'],
    ['profile.employeeView','Mitarbeiter-Ansicht aktiviert.','Employee view activated.'],['profile.managerView','Manager-Ansicht aktiviert.','Manager view activated.'],
    ['common.reason','Begründung','Reason'],['common.saved','Gespeichert','Saved'],['common.floor','Etage','Floor'],
    ['guest.welcomeTo','Willkommen zu','Welcome to'],
    ['floor.eg','EG','Ground floor'],['floor.1','1. OG','1st floor'],['floor.2','2. OG','2nd floor'],['floor.3','3. OG','3rd floor'],['floor.4','4. OG','4th floor'],['floor.none','Etage nicht hinterlegt','Floor not provided'],['floor.na','Etage n/a','Floor n/a'],['equip.none','Keine Ausstattungsinformationen','No equipment information'],['equip.none2','Keine Angaben','No information'],
    ['room.bestFitLegacy','Beste Passung','Best capacity fit'],
    ['requests.rejectedFallback','Die Anfrage konnte nicht bestätigt werden. Sie können eine neue Anfrage auf Basis dieser Daten starten.','The request could not be confirmed. You can create a new request based on these details.']
  ];
  const de={},en={},legacy={};for(const [k,d,e] of rows){de[k]=d;en[k]=e;if(!d.includes('{'))legacy[d]=k}
  const placeholders={'Konkreten Hinweis für den Mitarbeiter beschreiben':{de:'Konkreten Hinweis für den Mitarbeiter beschreiben',en:'Describe the requested change for the employee'}};
  (window.CM_I18N_PACKS||(window.CM_I18N_PACKS=[])).push({de,en,legacy,placeholders});
})();
