import { formatDate, language, t } from '../core/i18n.js';
import { safeHttpsUrl } from '../core/ui.js';
import { catalogData, localized, requestData, siteData } from './parity-data.js';

function docElement(doc, tagName, { text = '', className = '', attrs = {} } = {}) {
  const node = doc.createElement(tagName);
  if (className) node.className = className;
  if (text !== '') node.textContent = text;
  Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, String(value)));
  return node;
}

export function richPrint(requestId) {
  const request = requestData().find((entry) => entry.id === requestId);
  if (!request || request.status !== 'Confirmed') return;
  const catalog = catalogData();
  const room = (catalog.rooms || []).find((entry) => entry.id === request.roomId);
  const site = siteData()[request.location] || {};
  const printWindow = window.open('', '_blank');
  if (!printWindow) return;
  try { printWindow.opener = null; } catch {}

  const doc = printWindow.document;
  doc.documentElement.lang = language();
  doc.title = `${t('nav.welcome')} · ${request.id}`;
  const meta = docElement(doc, 'meta', { attrs: { name: 'viewport', content: 'width=device-width, initial-scale=1' } });
  doc.head.appendChild(meta);
  const style = docElement(doc, 'style');
  style.textContent = `
    @page{size:A4;margin:12mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#111;margin:0;font-size:10.5pt;line-height:1.48;background:#fff}
    .print-button{margin:0 0 14px;background:#1d1d1f;color:#fff;border:0;padding:10px 14px;font-weight:700}.hero{background:#1d1d1f;color:#fff;padding:28px 30px 26px;border-bottom:7px solid #C29A6B}
    .hero h1{font-size:32px;line-height:1.08;margin:18px 0 10px}.hero p{font-size:15px;color:#e8e8e8}.content{padding:22px 2px}.intro{font-size:14px;color:#333}
    .facts{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:18px 0}.fact,.card{border:1px solid #d0d0ce;padding:12px;background:#fff}.fact small{display:block;color:#63666a}.fact strong{display:block;margin-top:4px}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:11px;margin-bottom:11px}.card h2{font-size:15px;margin:0 0 9px;border-bottom:2px solid #C29A6B;padding-bottom:6px}.route{display:grid;grid-template-columns:1fr auto;gap:12px}.qr{width:126px;height:126px;border:1px solid #d0d0ce}
    .wifi{margin-top:11px;background:#F5EEE6;border-left:5px solid #C29A6B;padding:13px}.wifi-code{font-family:ui-monospace,monospace;background:#fff;border:1px solid #d0d0ce;padding:9px;white-space:pre-line}.mock{background:#fff7e6;border-left:4px solid #f0b429;padding:9px 11px}.closing{font-size:15px;font-weight:700;margin:20px 0 5px}
    @media print{.print-button{display:none}}@media(max-width:650px){.facts,.grid{grid-template-columns:1fr}.route{grid-template-columns:1fr}}
  `;
  doc.head.appendChild(style);

  const printButton = docElement(doc, 'button', { text: t('welcome.print.print'), className: 'print-button' });
  printButton.type = 'button';
  printButton.addEventListener('click', () => printWindow.print());
  doc.body.appendChild(printButton);
  const hero = docElement(doc, 'header', { className: 'hero' });
  hero.append(docElement(doc, 'small', { text: t('app.title') }), docElement(doc, 'h1', { text: t('welcome.print.hero') }), docElement(doc, 'p', { text: t('welcome.print.heroText', { title: request.title }) }));
  doc.body.appendChild(hero);

  const content = docElement(doc, 'main', { className: 'content' });
  if (site.mockData) {
    const notice = docElement(doc, 'aside', { className: 'mock' });
    notice.append(docElement(doc, 'strong', { text: `${t('welcome.print.demoTitle')} ` }), doc.createTextNode(t('welcome.print.demoText')));
    content.appendChild(notice);
  }
  content.appendChild(docElement(doc, 'p', { text: t('welcome.print.intro'), className: 'intro' }));
  const facts = docElement(doc, 'section', { className: 'facts' });
  [
    [t('schedule.date'), formatDate(request.date, { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })],
    [t('welcome.print.time'), `${request.start}–${request.end}`],
    [t('schedule.location'), request.location],
    [t('welcome.print.room'), `${localized(room?.name || request.roomId || '')}${localized(room?.floor) ? ` · ${localized(room.floor)}` : ''}`],
  ].forEach(([label, value]) => {
    const fact = docElement(doc, 'article', { className: 'fact' });
    fact.append(docElement(doc, 'small', { text: label }), docElement(doc, 'strong', { text: value || '—' }));
    facts.appendChild(fact);
  });
  content.appendChild(facts);

  const card = (heading, paragraphs) => {
    const section = docElement(doc, 'section', { className: 'card' });
    section.appendChild(docElement(doc, 'h2', { text: heading }));
    paragraphs.filter(Boolean).forEach((value) => section.appendChild(docElement(doc, 'p', { text: localized(value) })));
    return section;
  };

  const firstGrid = docElement(doc, 'section', { className: 'grid' });
  const directions = card(t('welcome.print.directions'), [site.address || t('guest.askOrganizer'), site.publicTransport, site.carArrival]);
  const route = safeHttpsUrl(site.mapsUrl);
  if (route) {
    const routeRow = docElement(doc, 'div', { className: 'route' });
    const link = docElement(doc, 'a', { text: t('guest.route'), attrs: { href: route, target: '_blank', rel: 'noopener noreferrer' } });
    const qr = docElement(doc, 'img', { className: 'qr', attrs: { src: `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=8&data=${encodeURIComponent(route)}`, alt: t('welcome.print.qrAlt'), referrerpolicy: 'no-referrer' } });
    routeRow.append(link, qr);
    directions.appendChild(routeRow);
  }
  firstGrid.append(directions, card(t('manager.parking'), [site.parking]));
  content.appendChild(firstGrid);

  const secondGrid = docElement(doc, 'section', { className: 'grid' });
  secondGrid.append(card(t('welcome.print.arrival'), [site.reception, site.visitorNotes]), card(t('welcome.print.building'), [site.building, site.accessibility]));
  content.appendChild(secondGrid);
  const thirdGrid = docElement(doc, 'section', { className: 'grid' });
  thirdGrid.append(card(t('welcome.print.contact'), [site.contact || t('guest.askOrganizer'), site.contactDetails]), card(t('welcome.print.goodToKnow'), [t('welcome.print.planTime'), t('welcome.print.help')]));
  content.appendChild(thirdGrid);

  if (site.wifiName && site.wifiPassword) {
    const wifi = docElement(doc, 'section', { className: 'wifi' });
    wifi.append(docElement(doc, 'h2', { text: t('welcome.print.wifi') }), docElement(doc, 'p', { className: 'wifi-code', text: `${t('guest.network')}: ${site.wifiName}\n${t('guest.code')}: ${site.wifiPassword}` }));
    if (site.wifiInstructions) wifi.appendChild(docElement(doc, 'p', { text: localized(site.wifiInstructions) }));
    content.appendChild(wifi);
  }
  content.appendChild(docElement(doc, 'p', { text: t('welcome.print.closing'), className: 'closing' }));
  doc.body.appendChild(content);
  printWindow.focus();
}
