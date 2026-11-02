#!/usr/bin/env bash
# Fails if the APK still holds code, permissions or addresses ObsidianCode removes.
# Usage: check-apk.sh <apk>   (needs ANDROID_HOME for aapt2)
set -euo pipefail

apk="$1"
aapt2="$(ls -d "$ANDROID_HOME"/build-tools/*/ | sort -V | tail -1)aapt2"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
unzip -q "$apk" -d "$work"
failed=0

echo "== Size: $(du -h "$apk" | cut -f1)"

echo "== Native code folders"
abis="$(cd "$work" && ls lib 2>/dev/null || true)"
echo "$abis"
if [ "$abis" != "arm64-v8a" ]; then
  echo "FAIL: native code must be arm64-v8a only"
  failed=1
fi

echo "== Permissions"
permissions="$("$aapt2" dump permissions "$apk" | sed -n "s/.*name='\([^']*\)'.*/\1/p" | sort -u)"
echo "$permissions"
for banned in \
  android.permission.CAMERA \
  android.permission.POST_NOTIFICATIONS \
  com.google.android.c2dm.permission.RECEIVE \
  com.google.android.finsky.permission.BIND_GET_INSTALL_REFERRER_SERVICE \
  com.google.android.gms.permission.AD_ID; do
  if grep -qx "$banned" <<<"$permissions"; then
    echo "FAIL: permission $banned"
    failed=1
  fi
done

echo "== Removed code"
classes="$(cat "$work"/classes*.dex | LC_ALL=C grep -a -o -E 'L[a-z][A-Za-z0-9_/$]+;' | sort -u)"
for banned in \
  Lcom/google/firebase/ \
  Lcom/google/android/gms/ \
  Lcom/google/mlkit/ \
  Lcom/google/android/datatransport/ \
  Lcom/android/installreferrer/ \
  Lcom/clerk/ \
  Lexpo/modules/updates/ \
  Lexpo/modules/notifications/ \
  Lexpo/modules/camera/ \
  Lexpo/modules/observe/ \
  Lexpo/modules/application/ \
  Lexpo/modules/t3agentnotifications/; do
  found="$(grep -F "$banned" <<<"$classes" | head -5 || true)"
  if [ -n "$found" ]; then
    echo "FAIL: classes under $banned, for example:"
    echo "$found"
    failed=1
  fi
done

echo "== Third-party addresses in the manifest, code and app bundle"
# Shown with their surroundings for review. Most are text, not connections: links in error
# messages, or fragments from the bundle's packed strings (e.g. "github.com/kitten/toqr" + "expo.dev").
# The connection allowlist blocks them anyway. Only service endpoints the app would contact fail.
"$aapt2" dump xmltree --file AndroidManifest.xml "$apk" > "$work/manifest.txt"
python3 -I - "$work/manifest.txt" "$work"/classes*.dex "$work"/assets/*.bundle <<'PY' || failed=1
import re, sys
shown = re.compile(rb"([a-z0-9-]+[.])*(expo[.](dev|io)|axiom[.]co|clerk[.](com|dev|t3[.]codes)|googleapis[.]com|app-measurement[.]com|crashlytics[.]com|sentry[.]io|posthog[.]com)")
endpoints = re.compile(rb"^(u[.]expo[.]dev|o[.]expo[.]dev|exp[.]host|api[.]axiom[.]co|api[.]clerk[.]com|clerk[.]t3[.]codes|firebase[a-z]*[.]googleapis[.]com|[a-z.]*app-measurement[.]com|[a-z.]*crashlytics[.]com|[a-z.]*sentry[.]io|[a-z.]*posthog[.]com)$")
seen, bad = set(), False
for path in sys.argv[1:]:
    data = open(path, "rb").read()
    for match in shown.finditer(data):
        host = match.group(0)
        if host == b"docs.expo.dev":
            continue
        context = re.sub(rb"[^ -~]", b".", data[max(0, match.start() - 60):match.end() + 40]).decode()
        if (host, context) in seen:
            continue
        seen.add((host, context))
        fail = bool(endpoints.match(host))
        bad |= fail
        print(("FAIL " if fail else "     ") + host.decode() + "  in " + path.rsplit("/", 1)[-1] + ": " + context)
print("none" if not seen else "")
sys.exit(1 if bad else 0)
PY

exit "$failed"
