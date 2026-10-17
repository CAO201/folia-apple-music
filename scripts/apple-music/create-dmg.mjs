import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

// scripts/apple-music/create-dmg.mjs
// Read-only drag-to-Applications disk image; contains installation notes and original attribution.
const root = process.cwd();
const arch = process.env.FOLIA_BUILD_ARCH || process.arch;
const pkg = JSON.parse(await fs.readFile('package.json', 'utf8'));
const output = path.join(root, 'release/apple-music');
const app = path.join(output, arch === 'arm64' ? 'mac-arm64' : 'mac', 'Folia Apple Music.app');
await fs.access(path.join(app, 'Contents/MacOS/Folia Apple Music'));
const staging = await fs.mkdtemp(path.join(output, '.dmg-'));
const filename = `Folia-Apple-Music-${pkg.version}-macOS-${arch}.dmg`;
try {
  await fs.cp(app, path.join(staging, 'Folia Apple Music.app'), { recursive: true, verbatimSymlinks: true });
  await fs.symlink('/Applications', path.join(staging, 'Applications'));
  for (const [source, destination] of [['release-materials/INSTALL.zh-CN.txt', '安装与首次使用.txt'],
    ['LICENSE', 'LICENSE'], ['NOTICE.md', '原作者署名-NOTICE.md'], ['THIRD_PARTY_NOTICES.md', 'THIRD_PARTY_NOTICES.md']]) {
    await fs.copyFile(source, path.join(staging, destination));
  }
  execFileSync('/usr/bin/hdiutil', ['create', '-volname', 'Folia Apple Music', '-srcfolder', staging,
    '-ov', '-format', 'UDZO', '-fs', 'HFS+', path.join(output, filename)], { stdio: 'inherit' });
  execFileSync('/usr/bin/hdiutil', ['verify', path.join(output, filename)], { stdio: 'inherit' });
  console.log(path.join(output, filename));
} finally { await fs.rm(staging, { recursive: true, force: true }); }
