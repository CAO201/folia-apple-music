#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/../.."
bridge='build/FoliaMusicBridge.app'
mkdir -p "$bridge/Contents/MacOS"
/usr/bin/swiftc -parse-as-library -swift-version 5 -target arm64-apple-macos14.0 native/apple-music/main.swift -o "$bridge/Contents/MacOS/FoliaMusicBridge"
/usr/bin/python3 - "$bridge/Contents/Info.plist" <<'PY'
import plistlib,sys,os
with open(sys.argv[1], 'wb') as f:
 plistlib.dump({'CFBundleIdentifier':os.environ.get('FOLIA_MUSICKIT_BUNDLE_ID','local.folia.applemusic.bridge'),'CFBundleName':'Folia Apple Music','CFBundleExecutable':'FoliaMusicBridge','CFBundlePackageType':'APPL','CFBundleVersion':'1','LSUIElement':True,'NSAppleMusicUsageDescription':'Folia 使用 Apple Music 访问你的资料库并播放你选择的音乐。'},f)
PY
if [[ -n "${FOLIA_SIGN_IDENTITY:-}" ]]; then
  : "${FOLIA_MUSICKIT_PROFILE:?Set FOLIA_MUSICKIT_PROFILE to the MusicKit-enabled provisioning profile}"
  cp "$FOLIA_MUSICKIT_PROFILE" "$bridge/Contents/embedded.provisionprofile"
  /usr/bin/security cms -D -i "$FOLIA_MUSICKIT_PROFILE" > build/apple-music-profile.plist
  /usr/bin/python3 - <<'PYPROFILE'
import plistlib,os
p=plistlib.load(open('build/apple-music-profile.plist','rb'))
e=p['Entitlements']
identifier=e.get('com.apple.application-identifier',e.get('application-identifier',''))
expected=os.environ.get('FOLIA_MUSICKIT_BUNDLE_ID','local.folia.applemusic.bridge')
assert identifier.endswith('.'+expected), 'Profile App ID does not match FOLIA_MUSICKIT_BUNDLE_ID'
assert e.get('com.apple.developer.music-user-token'), 'Profile does not enable MusicKit'
plistlib.dump(e,open('build/apple-music-entitlements.plist','wb'))
PYPROFILE
  /usr/bin/codesign --force --sign "$FOLIA_SIGN_IDENTITY" --entitlements build/apple-music-entitlements.plist "$bridge"
  rm build/apple-music-profile.plist build/apple-music-entitlements.plist
else
  /usr/bin/codesign --force --sign - "$bridge"
  echo 'Built unsigned development helper; MusicKit authorization requires Apple Developer signing.'
fi
