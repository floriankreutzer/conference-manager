import assert from 'node:assert/strict';
import test from 'node:test';

globalThis.document = { documentElement: { lang: 'de' } };
globalThis.window = { dispatchEvent() {} };
globalThis.CustomEvent = class CustomEvent {};
const { setLanguage } = await import('../src/core/i18n.js');
const { productionRequestSummaryFacts, productionRequestBusinessDetails } = await import(
  '../src/shared/production-request-details.js'
);

function request(overrides = {}) {
  return {
    roomId: 'room-1', startsAt: '2026-11-09T08:00:00.000Z', endsAt: '2026-11-09T09:00:00.000Z',
    internalParticipants: 1, externalParticipants: 2, status: 'Confirmed',
    details: { title: 'A'.repeat(160), dietaryRequirements: 'Nut allergy', specialRequirements: 'Step-free access',
      catering: { participantCount: 0 } },
    pricing: { currency: 'CHF', totalMinor: 12_345, services: [], catering: { packageSelection: null, items: [] } },
    allocations: { entries: [] },
    ...overrides,
  };
}

for (const language of ['de', 'en']) {
  test(`request facts retain authoritative time, participants, status and currency in ${language}`, () => {
    setLanguage(language);
    const source = request();
    const before = structuredClone(source);
    const facts = new Map(productionRequestSummaryFacts(source, {
      roomLabel: 'Room <b>One</b>', timeZone: 'Europe/Berlin', includeParticipantBreakdown: true,
    }).map((fact) => [fact.key, fact]));
    assert.equal(facts.size, 6);
    assert.equal(facts.get('room').value, 'Room <b>One</b>');
    assert.match(facts.get('start').value, /09:00/);
    assert.match(facts.get('end').value, /10:00/);
    assert.equal(facts.get('participants').value, language === 'de' ? '3 Teilnehmende' : '3 participants');
    assert.equal(facts.get('participants').detail, language === 'de' ? 'Intern: 1 · Extern: 2' : 'Internal: 1 · External: 2');
    assert.equal(facts.get('status').value, language === 'de' ? 'Bestätigt' : 'Confirmed');
    assert.match(facts.get('total').value, language === 'de' ? /123,45/ : /123\.45/);
    assert.match(facts.get('total').value, /CHF/);
    assert.deepEqual(source, before);
    const details = productionRequestBusinessDetails(source).map((entry) => entry[1]);
    assert.ok(details.includes('A'.repeat(160)));
    assert.ok(details.includes('Nut allergy'));
    assert.ok(details.includes('Step-free access'));
    assert.ok(details.includes(facts.get('total').value));
  });
}

test('legacy request facts do not invent a zero price or a browser timezone', () => {
  setLanguage('de');
  const facts = new Map(productionRequestSummaryFacts(request({ pricing: null, internalParticipants: 1, externalParticipants: 0 }), {
    roomLabel: 'Historical room', timeZone: null,
  }).map((fact) => [fact.key, fact]));
  assert.equal(facts.has('total'), false);
  assert.equal(facts.get('start').value, 'Zeitangabe nicht verfügbar');
  assert.equal(facts.get('end').value, 'Zeitangabe nicht verfügbar');
  assert.equal(facts.get('participants').value, '1 teilnehmende Person');
  assert.equal(facts.get('participants').detail, null);
});

test('booking-change facts preserve the separate workflow status and a genuine zero total', () => {
  setLanguage('en');
  const facts = new Map(productionRequestSummaryFacts(request({
    status: 'pending', pricing: { currency: 'EUR', totalMinor: 0 },
  }), { roomLabel: 'Room One', timeZone: 'Europe/Berlin' }).map((fact) => [fact.key, fact]));
  assert.equal(facts.get('status').value, 'Approval pending');
  assert.match(facts.get('total').value, /0\.00/);
});
