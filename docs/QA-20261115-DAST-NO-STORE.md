# CO-320: bounded no-store observations

Run 43706695784 executed actual passive scans against R405/F26e. Both protected
surface jobs failed their policy gates; that historical result remains failed.
The downloaded archives were independently hashed before inspecting their reports:

- Customer artifact 14158223633: SHA256 `ad38c0ea44c4dcf3fd7a375ab1820525e756d0e6591fb3dd03806f1345d0393c`.
- Platform artifact 14159175004: SHA256 `561e6a7501e440cb1dfef91810424da179dd379a5a7a8526ed333459a4e734c2`.

Both reports contain only risk-zero 10049-1, 10015 and 90005-1/-2/-3/-4.
The earlier missing-COEP observation is absent; this is not a general security
acceptance or authenticated business test.

The exact policy adds only observed URL/reference pairs. Non-storable content
requires literal `no-store`, GET, empty param/attack and risk zero. The old
`authorization:` exception remains Platform-only and limited to root, robots.txt
and sitemap.xml; new assets and platform-admin do not acquire that exception.
The protected platform-admin path also has observed risk-zero cache/request-header
entries. Summary unions are derived from the same exact URL inventory.

No response header is changed. No wildcard, scanner disablement, new origin,
risk increase or COEP exception is introduced. The uncapped scan, raw report,
pre/post identity and evidence checks remain mandatory. This policy correction
requires its own native CI, independent review and fresh live scan; replaying
existing reports does not turn their historical runs into success.

## Subsequent actual run

Run 43708743315 again failed the exact-policy gate, revealing three additional
non-storable URLs: Customer demo-security.css?v=20260830-77 and
tokens.css?v=20260825-01, and Platform pavurel-signet-monochrome-white.svg.
All use literal no-store and risk zero; no other acceptance is inferred.
Customer artifact 14159228808 has SHA256
`9ce8f99a465960a4a10b8b85cb1a2b11bdedd5a8d5801eaca9ecaa8dfb0d2d2b`;
Platform artifact 14158649915 has SHA256
`6289fda618deb4d27268da5e07d47164b8823727972ab771a6746c44f357e775`.
Both hashes were checked before reading the raw reports. Only those three
additional exact URL/reference pairs are added; the summary URL unions already
include them for other reviewed subtypes and remain unchanged.

Run 43709034774 passed Platform and static launchpad completely. Customer still
failed on the exact app-layout.css?v=20260919-92 URL with literal no-store, risk
zero. Archive 14160015717 was verified against SHA256
`071d9a62ab5b57bd7c528729d548e8622bdae312d2554747936914fba9282266`
before inspection. This last observed pair is added without expanding the summary
union or evidence/risk/method boundary. A subsequent complete scan remains required.
