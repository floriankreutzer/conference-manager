const MANAGER_MOBILE_QUERY = '(max-width: 760px)';
const mobileMedia = window.matchMedia(MANAGER_MOBILE_QUERY);

function currentManagerSection() {
  const tabs = document.querySelector('.manager-tabs');
  const section = tabs?.nextElementSibling;
  if (!(section instanceof HTMLElement)) return null;
  section.classList.add('manager-surface');
  return section;
}

function tableSignature(table) {
  return [...table.querySelectorAll('tr')]
    .map((row) => [...row.cells].map((cell) => cell.textContent.trim()).join('|'))
    .join('||');
}

function buildResponsiveTableCards(table) {
  const headers = [...table.querySelectorAll('thead th')].map((header) => header.textContent.trim());
  const cards = document.createElement('section');
  cards.className = 'responsive-table-cards';
  cards.dataset.responsiveTableCards = 'true';
  cards.dataset.tableSignature = tableSignature(table);

  [...table.querySelectorAll('tbody tr')].forEach((row) => {
    const card = document.createElement('article');
    card.className = 'responsive-table-card';

    [...row.cells].forEach((cell, index) => {
      const field = document.createElement('div');
      field.className = 'responsive-table-field';

      const label = document.createElement('span');
      label.className = 'responsive-table-label';
      label.textContent = headers[index] || '';

      const value = document.createElement('span');
      value.className = 'responsive-table-value';
      value.textContent = cell.textContent.trim();

      field.append(label, value);
      card.appendChild(field);
    });

    cards.appendChild(card);
  });

  return cards;
}

function syncResponsiveTable(table) {
  const sibling = table.nextElementSibling;
  let cards = sibling instanceof HTMLElement && sibling.matches('[data-responsive-table-cards]') ? sibling : null;

  if (!mobileMedia.matches) {
    table.hidden = false;
    if (cards) cards.hidden = true;
    return;
  }

  const signature = tableSignature(table);
  if (!cards || cards.dataset.tableSignature !== signature) {
    cards?.remove();
    cards = buildResponsiveTableCards(table);
    table.after(cards);
  }

  table.hidden = true;
  cards.hidden = false;
}

function syncResponsiveTables(section) {
  section.querySelectorAll('.report-card .data-table, .room-plan-list').forEach(syncResponsiveTable);
}

function defaultRoomPlanToListOnMobile(section) {
  if (!mobileMedia.matches || section.dataset.featureParity !== 'room-plan') return;
  if (section.dataset.mobileRoomPlanDefaultApplied === 'true') return;
  section.dataset.mobileRoomPlanDefaultApplied = 'true';

  const listButton = section.querySelector('[data-room-plan-view="LIST"]');
  if (listButton instanceof HTMLButtonElement && listButton.getAttribute('aria-pressed') !== 'true') {
    listButton.click();
  }
}

export function enhanceManagerResponsive() {
  const section = currentManagerSection();
  if (!section) return;
  defaultRoomPlanToListOnMobile(section);
  syncResponsiveTables(section);
  document.documentElement.dataset.managerResponsiveBuild = '2026.08.23.45';
}

mobileMedia.addEventListener('change', enhanceManagerResponsive);
