import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { extractFile } from '@electron/asar';

// scripts/apple-music/verify-dmg.mjs
// Mount read-only, copy to an isolated install location, compare payloads and verify the copied app signature.
const root = process.cwd();
const version = JSON.parse(await fs.readFile('package.json', 'utf8')).version;
const arch = process.env.FOLIA_BUILD_ARCH || process.arch;
const image = path.resolve(`release/apple-music/Folia-Apple-Music-${version}-macOS-${arch}.dmg`);
const temp = await fs.mkdtemp(path.resolve('test-results/dmg-verification-'));
const mount = path.join(temp, 'volume');
const installed = path.join(temp, 'installed/Folia Apple Music.app');
const original = path.resolve(`release/apple-music/${arch === 'arm64' ? 'mac-arm64' : 'mac'}/Folia Apple Music.app`);
await fs.mkdir(mount);
let attached = false;
const checks = { readOnlyMount: false, copiedInstall: false, payloadMatches: false, signature: false,
  attribution: false, thirdPartySources: false, architecture: arch, version };
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
try {
  execFileSync('/usr/bin/hdiutil', ['attach', '-readonly', '-nobrowse', '-mountpoint', mount, image], { stdio: 'inherit' }); attached = true;
  checks.readOnlyMount = true;
  if (await fs.readlink(path.join(mount, 'Applications')) !== '/Applications') throw new Error('Applications shortcut missing');
  await fs.mkdir(path.dirname(installed));
  execFileSync('/usr/bin/ditto', [path.join(mount, 'Folia Apple Music.app'), installed]); checks.copiedInstall = true;
  const payload = app => path.join(app, 'Contents/Resources/app.asar');
  checks.payloadMatches = sha(await fs.readFile(payload(installed))) === sha(await fs.readFile(payload(original)));
  execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', installed]); checks.signature = true;
  checks.attribution = ['LICENSE', 'NOTICE.md', 'THIRD_PARTY_NOTICES.md'].every(name => extractFile(payload(installed), name).length > 0);
  const manifest = JSON.parse(await fs.readFile(path.join(installed, 'Contents/Resources/third-party-sources/SOURCE-INFO.json'), 'utf8'));
  checks.thirdPartySources = true;
  for (const source of manifest) {
    if (sha(await fs.readFile(path.join(installed, 'Contents/Resources/third-party-sources', source.file))) !== source.sha256) checks.thirdPartySources = false;
  }
  if (Object.values(checks).some(value => value === false)) throw new Error('Disk image validation failed');
  await fs.writeFile('release-materials/PACKAGE_CHECKS.json', JSON.stringify(checks, null, 2) + '\n');
  await fs.writeFile('/tmp/folia-dmg-test-app-path.txt', path.join(installed, 'Contents/MacOS/Folia Apple Music'));
  console.log(JSON.stringify(checks));
} finally { if (attached) execFileSync('/usr/bin/hdiutil', ['detach', mount], { stdio: 'inherit' }); }
