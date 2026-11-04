#!/usr/bin/env bash
# Fails if the APK still holds code, permissions or addresses ObsidianCode removes.
# Usage: check-apk.sh <apk> [expected notices]   (needs ANDROID_HOME for aapt2)
set -euo pipefail

apk="$1"
aapt2="$(ls -d "$ANDROID_HOME"/build-tools/*/ | sort -V | tail -1)aapt2"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
unzip -q "$apk" -d "$work"
failed=0

echo "== Open-source notices"
notices="$work/assets/obsidiancode/THIRD-PARTY-NOTICES.txt"
if [ ! -s "$notices" ]; then
  echo "FAIL: bundled open-source notices are missing"
  failed=1
elif [ "$#" -ge 2 ] && ! cmp -s "$notices" "$2"; then
  echo "FAIL: bundled notices differ from the release attachment"
  failed=1
fi

echo "== Size: $(du -h "$apk" | cut -f1)"

echo "== Native code folders"
abis="$(cd "$work" && ls lib 2>/dev/null || true)"
echo "$abis"
if [ "$abis" != "arm64-v8a" ]; then
  echo "FAIL: native code must be arm64-v8a only"
  failed=1
fi

echo "== Tailscale library"
tailscale="$work/lib/arm64-v8a/libobsidiantailscale.so"
if [ ! -f "$tailscale" ]; then
  echo "FAIL: libobsidiantailscale.so is missing"
  failed=1
# Go keeps function names in stripped libraries. The address log.tailscale.com itself stays as
# harmless text (a constant and a comparison in TLS code), so the uploader's code is checked instead.
elif grep -aqE "tailscale[.]com/(logtail[.][(][*]Logger[)][.]upload|wgengine/netlog[.])" "$tailscale"; then
  echo "FAIL: libobsidiantailscale.so contains Tailscale's log upload"
  failed=1
else
  echo "present, $(du -h "$tailscale" | cut -f1), no log upload"
fi

echo "== Permissions"
permissions="$("$aapt2" dump permissions "$apk" | sed -n "s/.*name='\([^']*\)'.*/\1/p" | sort -u)"
echo "$permissions"
if ! grep -qx android.permission.POST_NOTIFICATIONS <<<"$permissions"; then
  echo "FAIL: local notification permission is missing"
  failed=1
fi
for banned in \
  android.permission.CAMERA \
  android.permission.POST_PROMOTED_NOTIFICATIONS \
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
  Lexpo/modules/appmetrics/ \
  Lexpo/modules/t3agentnotifications/; do
  found="$(grep -F "$banned" <<<"$classes" | head -5 || true)"
  if [ -n "$found" ]; then
    echo "FAIL: classes under $banned, for example:"
    echo "$found"
    failed=1
  fi
done

echo "== Third-party addresses in the manifest, code, native libraries and app bundle"
# Shown with their surroundings for review. Most are text, not connections: links in error
# messages, or fragments from the bundle's packed strings (e.g. "github.com/kitten/toqr" + "expo.dev").
# The connection allowlist blocks them anyway. Only service endpoints the app would contact fail.
"$aapt2" dump xmltree --file AndroidManifest.xml "$apk" > "$work/manifest.txt"
python3 -I - "$work/manifest.txt" "$work"/classes*.dex "$work"/lib/*/*.so "$work"/assets/*.bundle <<'PY' || failed=1
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
