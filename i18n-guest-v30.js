(() => {
  const rows = [
    ['guest.welcomeTitle', 'Willkommen zu „{title}“', 'Welcome to “{title}”'],
    ['guest.timeRange', '{start}–{end} Uhr', '{start}–{end}'],
    ['guest.detailsAria', 'Details für {title} anzeigen', 'View details for {title}'],
    ['guest.pdfAria', 'Willkommens-PDF für {title} erstellen', 'Create welcome PDF for {title}'],
    ['guest.infoAria', 'Gästeinformationen für {title} anzeigen', 'View guest information for {title}'],
    ['guest.demoLabel', 'Demo', 'Demo'],
    ['guest.locationDefault', 'Standort', 'Location'],
  ];

  const de = {};
  const en = {};

  rows.forEach(([key, deValue, enValue]) => {
    de[key] = deValue;
    en[key] = enValue;
  });

  (window.CM_I18N_PACKS ||= []).push({ de, en });
})();
