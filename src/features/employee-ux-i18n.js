import { language } from '../core/i18n.js';

const COPY = Object.freeze({
  de: Object.freeze({
    'progress.label': 'Schritt {step} von 6: {label}',
    'progress.future': 'Bitte schließen Sie zuerst den aktuellen Schritt ab.',
    'review.edit': 'Ändern',
    'review.editAria': '{section} ändern',
    'cost.guidanceTitle': 'Kosten transparent prüfen',
    'cost.guidance': 'Die angezeigten Raum- und Servicepreise werden einmal je Anfrage angesetzt. Bewirtung wird anhand Ihrer Paket-, Einzeloptionen- und Personenauswahl berechnet.',
    'cost.centerTitle': 'Welche Kostenstelle soll ich angeben?',
    'cost.centerHelp': 'Geben Sie die Kostenstelle ein, der die Veranstaltung belastet werden soll. Falls Sie sie nicht kennen, klären Sie sie vor dem Absenden mit Ihrem Team oder der zuständigen Kostenstellenverantwortung.',
    'cost.centerPlaceholder': 'z. B. 471100',
    'room.refreshAgain': 'Verfügbarkeit neu prüfen',
  }),
  en: Object.freeze({
    'progress.label': 'Step {step} of 6: {label}',
    'progress.future': 'Please complete the current step first.',
    'review.edit': 'Edit',
    'review.editAria': 'Edit {section}',
    'cost.guidanceTitle': 'Review costs transparently',
    'cost.guidance': 'The displayed room and service prices are applied once per request. Catering is calculated from your package, item and participant selections.',
    'cost.centerTitle': 'Which cost center should I enter?',
    'cost.centerHelp': 'Enter the cost center that should be charged for the event. If you do not know it, clarify it with your team or the responsible cost-center owner before submitting.',
    'cost.centerPlaceholder': 'e.g. 471100',
    'room.refreshAgain': 'Check availability again',
  }),
});

export function uxText(key, values = {}) {
  const lang = language() === 'en' ? 'en' : 'de';
  const template = COPY[lang][key] || COPY.de[key] || key;
  return String(template).replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, token) => String(values[token] ?? `{${token}}`));
}
