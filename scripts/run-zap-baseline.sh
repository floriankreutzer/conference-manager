#!/usr/bin/env bash
set -euo pipefail

readonly addon_manifest='/zap/wrk/addons.txt'
auth_args=()
if [[ "${ZAP_TARGET:-}" == 'https://conference-manager-ops-demo.onrender.com/' ]]; then
  if [[ ! "${DAST_OPERATIONS_PASSWORD:-}" =~ ^[A-Za-z0-9_-]{43}$ ]]; then
    echo 'DAST_OPERATIONS_CREDENTIAL_INVALID' >&2
    exit 1
  fi
  authorization="Basic $(printf 'ops:%s' "$DAST_OPERATIONS_PASSWORD" | base64 | tr -d '\n')"
  auth_args=(
    -config 'replacer.full_list(0).description=Operations Demo perimeter'
    -config 'replacer.full_list(0).enabled=true'
    -config 'replacer.full_list(0).url=^https://conference-manager-ops-demo[.]onrender[.]com/.*$'
    -config 'replacer.full_list(0).matchtype=REQ_HEADER'
    -config 'replacer.full_list(0).matchstr=Authorization'
    -config 'replacer.full_list(0).regex=false'
    -config "replacer.full_list(0).replacement=$authorization"
  )
elif [[ -n "${DAST_OPERATIONS_PASSWORD:-}" ]]; then
  echo 'DAST_OPERATIONS_TARGET_REJECTED' >&2
  exit 1
fi
unset DAST_OPERATIONS_PASSWORD

# ZAP can echo command-line configuration and response details. Keep its raw
# console output inside the disposable container; publish only checked reports.
trap 'echo "ZAP_BASELINE_FAILED (inspect credential-checked evidence)" >&2' ERR

# Preserve the official baseline wrapper's -a rule set before running the
# repository-owned Automation Framework plan in the same container/home.
zap.sh -cmd \
  -addonupdate \
  -addoninstall pscanrulesBeta \
  -addoninstall pscanrulesAlpha >/dev/null 2>&1
zap.sh -cmd -addonlist > "$addon_manifest" 2>/dev/null

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
if (( ${#auth_args[@]} )); then require_addon replacer release; fi

zap.sh -cmd \
  -autorun /zap/wrk/zap.yaml \
  -config stats.pkg.baseline-af=1 \
  "${auth_args[@]}" >/dev/null 2>&1
