#!/usr/bin/env bash
set -euo pipefail

base="${DETOX_METRO_URL:-http://127.0.0.1:8081}"
base="${base%/}"
url="${METRO_STATUS_URL:-${base}/status}"
tries="${METRO_WAIT_TRIES:-60}"
sleep_secs="${METRO_WAIT_SLEEP_SECS:-2}"

for ((i = 1; i <= tries; i++)); do
  if curl -sf "${url}" >/dev/null 2>&1; then
    echo "Metro is up (${url})"
    exit 0
  fi
  sleep "${sleep_secs}"
done

echo "Metro failed to start after ${tries} attempts (${url})" >&2
exit 1
