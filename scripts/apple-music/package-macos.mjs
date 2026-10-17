import { build, Platform, Arch } from 'electron-builder';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

// scripts/apple-music/package-macos.mjs
// Build from locked npm dependencies, then ad-hoc sign the free, non-notarized test app.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
if (process.platform !== 'darwin') throw new Error('Build this macOS test package on macOS.');
const requested = process.env.FOLIA_BUILD_ARCH || process.arch;
if (!['arm64', 'x64'].includes(requested)) throw new Error('Expected arm64 or x64.');
const arch = requested === 'arm64' ? Arch.arm64 : Arch.x64;
await build({ projectDir: root, targets: Platform.MAC.createTarget(['dir'], arch),
  config: path.join(root, 'scripts/apple-music/builder.config.cjs'), publish: 'never' });
const app = path.join(root, 'release/apple-music', requested === 'arm64' ? 'mac-arm64' : 'mac', 'Folia Apple Music.app');
execFileSync('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' });
execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', app], { stdio: 'inherit' });
console.log(app);
