# Manager business CSV

This is the human file format for the existing receipt-bound settings API. Conference
Manager owns Rooms, Services, Equipment, Catering items and Catering packages. Tenant
Admin keeps technical Room/Site and provider ownership. CSV never grants authority.

## File format

Use UTF-8 (optional UTF-8 BOM), commas and RFC-style quoted cells. Quotes inside a
quoted cell are doubled. Line endings may be CRLF, LF or CR; quoted multiline values
remain a single cell. Unquoted embedded quotes and trailing text after a closing quote
are errors. Use the per-type template; preserve the header names and `id` first.

Limits: 65,536 encoded bytes, 1,024 data rows, 16,384 encoded bytes per plain cell
(structured JSON cells share the 65,536-byte file bound), JSON depth
eight and at most 32 keys per JSON object. Catalogue limits still apply on the server:
200 Services, 200 Equipment, 300 Catering items, 100 packages, 20 variants per package,
200 Site/Room references and 300 item references. Import and Apply remain separate.

| Type | Columns |
| --- | --- |
| Rooms | id, siteId, name, description, capacity, active, floor, equipment, accessibility, serviceIds, cateringPackageIds, floorplanAssetId, mediaAssetIds |
| Services / Equipment / Catering items | id, name, description, price, active, order, siteIds, roomIds |
| Catering packages | id, name, description, price, active, order, siteIds, roomIds, itemIds, variants |

`id` is a stable identifier, not a display name. Export first to obtain identifiers.
Room `siteId`, floorplan and media references must be preserved; their presence in the
CSV does not authorize technical reassignment. New provider Rooms cannot be created by
this import. Public/legacy Guest prose, provider mappings and Room prices are excluded.
Room price is edited at the Room using an ordinary currency amount.

Text cells contain plain text; empty optional cells become null. `active` is `true` or
`false`; `capacity` and `order` use whole machine-readable numbers. Nested/array cells
start with `json:`, followed by bounded JSON. Examples before CSV quoting:

- Price: `json:{"amountMinor":1250,"currency":"EUR"}` means 12.50 EUR. Supported
  currencies are CHF, EUR, GBP and USD; amounts use integer cents/pence, never floats.
- Site selection: `json:["berlin"]`, using IDs from the authoritative Site export.
- Room selection: `json:["room-a"]`, using IDs from the Room export.
- Item selection: `json:["coffee"]`, using IDs from the Catering-item export.
- Empty selection: `json:[]`. Empty applicability lists mean no restriction.
- Variants use the existing exact id/name/description/price/active/order object schema.

Spreadsheet formula prefixes (including leading whitespace, tabs and carriage returns)
are neutralized with a leading apostrophe. Literal leading apostrophes are escaped too,
so importing an unedited export restores the original text exactly. Do not remove the
protective apostrophe in a spreadsheet. CSV does not evaluate formulas or code.

## Editing and safe Apply

The form uses named multiple selections from loaded Site/Room/Catering data. Native
selection controls support keyboard and mobile pickers; expanded DE/EN disclosure help
explains prices, currency, order and applicability. New referenced catalogue objects
must be saved before choosing them in another object.

Template → edit → Validate → review → Apply → reload. Export → reimport without edits
must report no changes. Import patches one collection, preserving omitted rows and all
other collections. The backend validates positive schemas, same-Tenant references,
role, CSRF, domain limits and transitions; then it binds a short-lived receipt to the
actor, Tenant, aggregate, document hash and revision. A changed file/type, role change,
expired receipt or concurrent revision cannot reuse the old validation authority.

A large current-state export can exceed the bounded import size. Split it into files
below 65,536 encoded bytes while retaining the header in each file; partial imports
preserve omitted rows. Validate each file against the revision resulting from the
previous Apply. The size limit is not bypassed for exported or previously trusted data.

Parser errors report a bounded localized reason and row/column without echoing file
contents. Backend validation errors never expose another Tenant's object existence.

The real PostgreSQL browser contract is `tests/e2e-shared/business-csv.spec.js` in
Chromium and WebKit. Permanent three-customer/two-reset acceptance remains mandatory
and unchanged. Equipment requires the paired API schema-42 migration before release;
this document describes implementation, not an unexecuted release acceptance.
