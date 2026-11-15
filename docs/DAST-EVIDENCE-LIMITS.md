# Complete passive DAST evidence

Tracking: CO-320. Evidence completeness is separate from acceptance of any finding.

The passive Automation Framework plan's `maxAlertsPerRule: 0` does not remove
ZAP core's systemic-alert limit or the report instance limit. The core defaults
are five systemic instances and twenty report instances. Keep both
`alert.systemicLimit=0` and `alert.maxInstances=0` on the actual final scan
invocation in `scripts/run-zap-baseline.sh`, in addition to the existing plan.
Otherwise repeated runs can expose different small samples while omitting other
instances; those reports must not be described as exhaustive evidence.

The primary implementation is ZAP's
[AlertParam](https://github.com/zaproxy/zaproxy/blob/17c25b45ad0f79631ae8d611a6fa647275aa131b/zap/src/main/java/org/zaproxy/zap/extension/alert/AlertParam.java)
and [ExtensionAlert](https://github.com/zaproxy/zaproxy/blob/17c25b45ad0f79631ae8d611a6fa647275aa131b/zap/src/main/java/org/zaproxy/zap/extension/alert/ExtensionAlert.java).
The [report option documentation](https://www.zaproxy.org/docs/desktop/ui/dialogs/options/alert/)
defines zero as unlimited report instances. The checked systemic implementation
likewise does not impose that limit when the configured value is zero.

Removing evidence caps does not authorize more scan destinations, a longer
spider window, active attacks, changed credentials, scanner suppression or a
higher accepted risk. Keep all existing origin, time, byte/secret, report-schema,
exact-URL, evidence and risk checks. New findings must still fail until assessed
and corrected or narrowly reviewed under the existing acceptance process.
A bounded crawl with every discovered instance is not proof of full authenticated
application coverage. Local argument/negative tests do not establish a live scan.
Retain actual original artifacts and source/job identities for the later native
execution, including failed runs; never manufacture a pass by truncating reports.
