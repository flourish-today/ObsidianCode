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
# docs.expo.dev only appears in error messages that link to Expo's documentation.
strings_found="$({ "$aapt2" dump xmltree --file AndroidManifest.xml "$apk"; cat "$work"/classes*.dex "$work"/assets/*.bundle 2>/dev/null; } | LC_ALL=C grep -a -o -E '([a-z0-9-]+\.)*(expo\.dev|expo\.io|axiom\.co|clerk\.com|clerk\.t3\.codes|googleapis\.com|app-measurement\.com|crashlytics\.com|sentry\.io|posthog\.com)' | grep -v -x 'docs\.expo\.dev' | sort | uniq -c || true)"
echo "${strings_found:-none}"
if [ -n "$strings_found" ]; then
  echo "FAIL: third-party addresses left"
  failed=1
fi

exit "$failed"
