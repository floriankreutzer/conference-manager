#!/usr/bin/env bash
set -euo pipefail

readonly addon_manifest='/zap/wrk/addons.txt'

# Preserve the official baseline wrapper's -a rule set before running the
# repository-owned Automation Framework plan in the same container/home.
zap.sh -cmd \
  -addonupdate \
  -addoninstall pscanrulesBeta \
  -addoninstall pscanrulesAlpha
zap.sh -cmd -addonlist > "$addon_manifest"

require_addon() {
  local addon_id="$1"
  local release_status="$2"
  awk -F '\t' -v addon_id="$addon_id" -v release_status="$release_status" '
    $2 == addon_id && $3 ~ /^v[0-9][0-9A-Za-z._-]*$/ && $4 == release_status { found = 1 }
    END { exit !found }
  ' "$addon_manifest"
}

require_addon pscanrulesBeta beta
require_addon pscanrulesAlpha alpha

zap.sh -cmd \
  -autorun /zap/wrk/zap.yaml \
  -config stats.pkg.baseline-af=1
