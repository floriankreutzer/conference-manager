import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import test from 'node:test';
import { normalizeGuestPresentation } from '../src/core/guest-presentation.js';
import { createTenantLocationSettingsApi } from '../src/platform/tenant-location-settings-api.js';

function guest() {
  return {
    address: { line1: 'Main Street 1', line2: null, postalCode: '10115', city: 'Berlin', countryCode: 'DE' },
    publicTransport: 'Use the central station exit', arrival: 'Use the main entrance', parking: null,
    reception: 'Check in at reception', building: null, visitorNotes: null, accessibility: 'Step-free entrance',
    wifiPolicy: 'credentials_on_arrival', wifiNetworkName: 'Guest',
    contact: { name: 'Reception', email: 'reception@example.test', phone: null },
    routeUrl: 'https://www.openstreetmap.org/way/123',
  };
}
function locations(schemaVersion = 2, guestInformation = guest()) {
  return { locations: {
    schemaVersion, revision: 4, providerContext: [], configuration: {
      sites: [{ id: 'berlin', name: 'Berlin', active: true, timeZone: 'Europe/Berlin', address: null,
        ...(schemaVersion === 2 ? { guestInformation } : {}),
      }], rooms: [],
    },
  } };
}
function client(responses) {
  const calls = [];
  return { calls, async request(path, options) {
    calls.push({ path, options });
    const response = responses.shift();
    if (response instanceof Error) throw response;
    return structuredClone(response);
  } };
}

test('API-02 guest presentation preserves complete public fields and explicit clearing', () => {
  assert.deepEqual(normalizeGuestPresentation(guest()), guest());
  assert.equal(Object.isFrozen(normalizeGuestPresentation(guest()).contact), true);
  assert.equal(normalizeGuestPresentation(null), null);
  assert.throws(() => normalizeGuestPresentation(undefined));
  const normalized = normalizeGuestPresentation({
    ...guest(),
    address: { ...guest().address, city: 'Ko\u0308ln' },
    arrival: 'Ga\u0308ste melden sich am Empfang.',
    contact: { ...guest().contact, name: 'Jose\u0301' },
    wifiNetworkName: 'Ga\u0308ste',
  });
  assert.equal(normalized.address.city, 'Köln');
  assert.equal(normalized.arrival, 'Gäste melden sich am Empfang.');
  assert.equal(normalized.contact.name, 'José');
  assert.equal(normalized.wifiNetworkName, 'Gäste');
  assert.deepEqual(normalizeGuestPresentation({
    address: null, publicTransport: null, arrival: null, parking: null, reception: null,
    building: null, visitorNotes: null, accessibility: null, wifiPolicy: 'not_available',
    wifiNetworkName: null, contact: null, routeUrl: null,
  }), {
    address: null, publicTransport: null, arrival: null, parking: null, reception: null,
    building: null, visitorNotes: null, accessibility: null, wifiPolicy: 'not_available',
    wifiNetworkName: null, contact: null, routeUrl: null,
  });
});

test('API-02 guest input rejects hidden fields, incomplete groups, credentials and unsafe routes', () => {
  const candidates = [
    { ...guest(), password: 'forbidden' }, { ...guest(), arrival: 'Password: forbidden' },
    { ...guest(), arrival: 'Door code 1234' },
    { ...guest(), arrival: 'Passwort lautet Sommer2026' },
    { ...guest(), arrival: 'Wi-Fi password Sommer2026' },
    { ...guest(), arrival: 'P.a.s.s.w.o.r.d = Sommer2026' },
    { ...guest(), arrival: 'Pаssword: Sommer2026' },
    { ...guest(), arrival: 'Pаѕѕwоrd: Sommer2026' },
    { ...guest(), arrival: 'P@ssw0rd: Sommer2026' },
    { ...guest(), arrival: 'P@ssw0rd1234' },
    { ...guest(), arrival: 'Wi‑Fi password Sommer2026' },
    { ...guest(), arrival: 'Ｐａｓｓｗｏｒｄ: Sommer2026' },
    { ...guest(), arrival: 'Password sunshine' },
    { ...guest(), arrival: 'Door code Sesame' },
    { ...guest(), arrival: 'Access code Blue' },
    { ...guest(), arrival: 'PIN alpha' },
    { ...guest(), arrival: 'Passwort Sommer' },
    { ...guest(), arrival: 'WLAN Passwort Herbst' },
    { ...guest(), arrival: 'Wi-Fi password sunshine' },
    { ...guest(), arrival: 'Wi-Fi code 1234' },
    { ...guest(), arrival: 'WLAN code 1234' },
    { ...guest(), arrival: 'API key abc123' },
    { ...guest(), arrival: 'Voucher: ABCD-1234' },
    { ...guest(), arrival: 'Pass\u051dord: Sommer2026' },
    { ...guest(), arrival: 'Dooг code 1234' },
    { ...guest(), arrival: 'Door cօde 1234' },
    { ...guest(), arrival: 'D-o-o-г code 1234' },
    { ...guest(), arrival: 'D.o.o.г cօde 1234' },
    { ...guest(), arrival: 'Doorcode1234' },
    { ...guest(), arrival: 'Doorcode2' },
    { ...guest(), arrival: 'Door code1234' },
    { ...guest(), arrival: 'PasswortSommer2026' },
    { ...guest(), arrival: 'WiFipasswordSommer2026' },
    { ...guest(), arrival: 'PasswortlautetSommer2026' },
    { ...guest(), arrival: 'PasswordisSecret' },
    { ...guest(), arrival: 'P@sswordisSecret' },
    ...[
      'Passwordissecret', 'Passwordis Secret', 'Passwordis 1234',
      'Passwortlautet:Sommer2026', 'Passwortlautet Sommer2026', 'Passwortlautetsommer2026',
      'passwordsommer2026', 'passwordsecret', 'Doorcodesesame', 'Doorcodeabcd', 'Doorcodeblue',
      'PASSWORDSecret', 'PassworDSecret', '1Password: Secret', '2Password: Secret',
      '0Passwort: Sommer2026', '2026Password: Secret',
      'Pɑssword: Sommer2026', 'PıN 1234', 'Pᴀssword: Sommer2026', 'Pɐssword: Sommer2026',
      'Passwørd: Sommer2026', 'Paꞩꞩword: Sommer2026', 'passᴡord: Sommer2026',
      'passwɵrd: Sommer2026', 'pɪn 1234', 'pɩn 1234', 'ᴘɪɴ 1234',
      'ОТР: 123456', 'ΡЅΚ: abc123', 'ΑΡΙ ΚΕΥ: abc123',
      'раѕѕԝогԁ: Sommer2026', 'ԁоог соԁе 1234',
      'Doo г code 1234', 'Door c օ de 1234', 'Door@code 1234',
      'GuestPassword1234', 'guestpassword1234', 'MyPasswortSommer2026', 'MainDoorcode1234',
      'OfficeDoor code 1234', 'GuestWiFipasswordSommer2026', ['Secret', 'PIN1234'].join(''),
      'ᏢᎪᏚᏚᎳᎾᎡᎠ: Sommer2026', 'Ꮲ.Ꭺ.Ꮪ.Ꮪ.Ꮃ.Ꮎ.Ꭱ.Ꭰ: Sommer2026',
      'P@sswordless entrance at Door 4',
      'GuestPasswordless entrance', '2026Passwordless access',
      'Door@c0de 1234', 'Door$c0de 1234', 'API@k3y abc', 'API$k3y abc',
      'ᏢᏆᏁ 1234', 'Ꮲ.Ꮖ.Ꮑ 1234',
    ].map((arrival) => ({ ...guest(), arrival })),
    { ...guest(), arrival: 'Client secret: abc123' },
    ...['Passcode 1234', 'Wi-Fi passcode 1234', 'WLAN secret abc', 'Auth token abc',
      'One-time code 1234', 'Access key abc'].map((arrival) => ({ ...guest(), arrival })),
    { ...guest(), arrival: 'One-time password: abc123' },
    ...['\u061c', '\u00ad', '\u180e', '\u2029', '\ud800']
      .map((control) => ({ ...guest(), arrival: `Pass${control}word: Sommer2026` })),
    { ...guest(), parking: '<script>forbidden</script>' }, { ...guest(), building: 'https://example.test/private' },
    { ...guest(), visitorNotes: 'x'.repeat(1_201) }, { ...guest(), wifiPolicy: 'not_available' },
    { ...guest(), address: { ...guest().address, line1: null } },
    { ...guest(), contact: { ...guest().contact, name: null } },
    ...[
      'javascript:alert(1)', 'https://example.test/path', 'https://www.google.com/account',
      'https://maps.google.com:443/maps', 'https://user@maps.google.com/maps',
      'https://maps.apple.com/?q=secret', 'https://www.openstreetmap.org/#map',
      'https://www.openstreetmap.org/way/%253fsecret',
      'https://www.openstreetmap.org/way/Pɑssword',
      'https://www.openstreetmap.org/way/Door@c0de1234',
      'https://www.openstreetmap.org/way/Door$c0de1234',
      'https://www.openstreetmap.org/way/API@k3y-abc',
      'https://www.openstreetmap.org/way/API$k3y-abc',
      'https://www.openstreetmap.org/way/ᏢᏆᏁ1234',
      'https://www.openstreetmap.org/way/Ꮲ.Ꮖ.Ꮑ-1234',
    ].map((routeUrl) => ({ ...guest(), routeUrl })),
  ];
  for (const candidate of candidates) assert.throws(() => normalizeGuestPresentation(candidate));
  assert.throws(() => normalizeGuestPresentation({ ...guest(), arrival: 'Password: forbidden' }), { field: 'arrival' });
  assert.throws(() => normalizeGuestPresentation({ ...guest(), routeUrl: 'https://example.test/private' }), { field: 'routeUrl' });
  assert.throws(() => normalizeGuestPresentation({
    ...guest(), address: { ...guest().address, line1: null },
  }), { field: 'line1' });
  const descriptor = Object.getOwnPropertyDescriptor(guest(), 'arrival');
  const accessor = guest();
  Object.defineProperty(accessor, 'arrival', { enumerable: true, get() { throw new Error('must not execute'); } });
  assert.equal(descriptor.enumerable, true);
  assert.throws(() => normalizeGuestPresentation(accessor), { code: 'TENANT_SITE_GUEST_INFORMATION_INVALID' });
});

test('API-02 credential screening accepts safe public wayfinding without credential labels', () => {
  for (const arrival of [
    'Ask reception for connection details on arrival.',
    'The entrance instructions are available from reception.',
    'Die WLAN-Informationen sind vor Ort erhältlich.',
    'Die Zugangsinformationen werden bei der Rezeption ausgegeben.',
    'A keypad reader is beside reception.',
    'Enter through Door 4 near the access ramp.',
    'Use the passwordless entrance beside reception.',
    'Pine Street 1 is beside the station.',
    'Use the Pink parking area.',
    'The Pinneberg office is step-free.',
    'Гости проходят через главный вход.',
    'Информация о транспорте',
    'Гости узнают о транспорте на стойке.',
    'Οι επισκέπτες χρησιμοποιούν την κύρια είσοδο.',
    'Հյուրերն օգտվում են գլխավոր մուտքից։',
    'Berlin Москва 東京',
    '会議室A',
    'Reception/受付',
    'Gate入口',
    '会議室',
    'Door入口案内',
    'Gate入口案内',
    'Access入口案内',
    'Entrance入口案内',
    'WiFi接続案内',
    'WLAN接続案内',
    'API利用案内',
    'Door 入口 案内',
    'Gate / 入口 / 案内',
    'WiFi 接続 案内',
    'WLAN – 接続 – 案内',
    'API 利用 案内',
    'ᎣᏏᏲ ᎠᏰᎵ',
    'Use the passwordless entrance at Door 4.',
    'Use the passwordless entrance on Straße 1.',
    'Passwordless access — Этаж 2',
    'Meet at Door @ reception.',
    'Parking costs $5 at reception.',
    'The Łódź office is beside the Œuvre entrance.',
  ]) {
    assert.equal(normalizeGuestPresentation({ ...guest(), arrival }).arrival, arrival);
  }
  const localized = normalizeGuestPresentation({
    ...guest(),
    wifiNetworkName: 'ホテルWiFi',
    contact: { ...guest().contact, email: 'office@例.jp' },
  });
  assert.equal(localized.wifiNetworkName, 'ホテルWiFi');
  assert.equal(localized.contact.email, 'office@例.jp');
  for (const routeUrl of [
    'https://www.google.com/maps/place/東京タワー',
    'https://www.openstreetmap.org/way/Москва',
    'https://www.openstreetmap.org/way/Room@Reception',
    'https://www.openstreetmap.org/way/Room$Reception',
  ]) {
    assert.equal(normalizeGuestPresentation({ ...guest(), routeUrl }).routeUrl, new URL(routeUrl).href);
  }
});

test('API-02 credential screening keeps compatibility-normalized maximum text work bounded', () => {
  const compatibilityExpanded = 'ﷺ'.repeat(1_200);
  const startedAt = performance.now();
  for (let attempt = 0; attempt < 12; attempt += 1) {
    assert.equal(normalizeGuestPresentation({
      ...guest(), visitorNotes: compatibilityExpanded,
    }).visitorNotes, compatibilityExpanded);
  }
  assert.ok(performance.now() - startedAt < 5_000);
});

test('API-02 Locations v2 uses explicit version negotiation and exact versioned writes', async () => {
  const apiClient = client([locations(), locations(), { revision: {
    revision: 4, configuration: locations().locations.configuration,
    changedAt: '2026-09-12T00:00:00.000Z', actorUserId: '11111111-1111-4111-8111-111111111111',
  } }, locations()]);
  const api = createTenantLocationSettingsApi({ apiClient });
  assert.deepEqual(await api.loadLocations({ schemaVersion: 2 }), locations().locations);
  await api.saveLocations({ schemaVersion: 2, expectedRevision: 4, configuration: locations().locations.configuration });
  await api.loadLocationRevision(4, { schemaVersion: 2 });
  await api.rollbackLocations({ schemaVersion: 2, expectedRevision: 4, sourceRevision: 3 });
  assert.deepEqual(apiClient.calls, [
    { path: 'v1/tenant/settings/locations?schemaVersion=2', options: undefined },
    { path: 'v1/tenant/settings/locations', options: { method: 'PUT', body: {
      schemaVersion: 2, expectedRevision: 4, configuration: locations().locations.configuration,
    } } },
    { path: 'v1/tenant/settings/locations/history/4?schemaVersion=2', options: undefined },
    { path: 'v1/tenant/settings/locations/rollback', options: { method: 'POST', body: {
      schemaVersion: 2, expectedRevision: 4, sourceRevision: 3,
    } } },
  ]);
});

test('API-02 rejects version drift and guest mutations before transport while v1 remains exact', async () => {
  for (const schemaVersion of [0, 3, '2', null]) {
    const apiClient = client([]);
    const api = createTenantLocationSettingsApi({ apiClient });
    await assert.rejects(api.loadLocations({ schemaVersion }));
    await assert.rejects(api.saveLocations({ schemaVersion, expectedRevision: 4, configuration: locations().locations.configuration }));
    assert.deepEqual(apiClient.calls, []);
  }
  await assert.rejects(createTenantLocationSettingsApi({ apiClient: client([locations(1)]) }).loadLocations({ schemaVersion: 2 }));
  await assert.rejects(createTenantLocationSettingsApi({ apiClient: client([locations()]) }).loadLocations());
  const apiClient = client([]);
  const api = createTenantLocationSettingsApi({ apiClient });
  await assert.rejects(api.saveLocations({ expectedRevision: 4, configuration: locations().locations.configuration }));
  await assert.rejects(api.saveLocations({ schemaVersion: 2, expectedRevision: 4,
    configuration: locations(2, { ...guest(), routeUrl: 'https://example.test/private' }).locations.configuration,
  }));
  assert.deepEqual(apiClient.calls, []);
  const clearing = client([locations(2, null)]);
  await createTenantLocationSettingsApi({ apiClient: clearing }).saveLocations({ schemaVersion: 2,
    expectedRevision: 4, configuration: locations(2, null).locations.configuration,
  });
  assert.equal(clearing.calls[0].options.body.configuration.sites[0].guestInformation, null);
});
