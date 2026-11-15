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
