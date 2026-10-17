import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

// scripts/apple-music/prepare-source-licenses.mjs
// Supply the exact LGPL FFmpeg source and locked build recipes alongside the distributed binary.
const output = path.resolve('release-materials/third-party-sources');
const sources = [
  { file: 'ffmpeg-8.1.2.tar.gz', sha256: '32faba5ef67340d54724941eae1425580791195312a4fd13bf6f820a2818bf22',
    url: 'https://github.com/chthollyphile/folia-ffmpeg-build/releases/download/v8.1.2-folia.3/ffmpeg-8.1.2.tar.gz' },
  { file: 'folia-ffmpeg-build-c6d5d62.tar.gz', sha256: '8ec2ca65267f63c470cca791d785cbf165d9455e0fb33ae1cfc2d0f3e83378d3',
    url: 'https://codeload.github.com/chthollyphile/folia-ffmpeg-build/tar.gz/c6d5d62dc5a0bf9e3d1d1cc474a39ae1fd51866e' },
];
const hash = value => createHash('sha256').update(value).digest('hex');
await fs.mkdir(output, { recursive: true });
for (const source of sources) {
  const file = path.join(output, source.file);
  let bytes = await fs.readFile(file).catch(() => null);
  if (!bytes || hash(bytes) !== source.sha256) {
    const response = await fetch(source.url, { signal: AbortSignal.timeout(180000) });
    if (!response.ok) throw new Error(`Cannot obtain corresponding source: ${response.status} ${source.file}`);
    bytes = Buffer.from(await response.arrayBuffer());
    if (hash(bytes) !== source.sha256) throw new Error(`Source integrity mismatch: ${source.file}`);
    await fs.writeFile(file, bytes);
  }
}
await fs.writeFile(path.join(output, 'SOURCE-INFO.json'), JSON.stringify(sources, null, 2) + '\n');
console.log('FFmpeg corresponding source and build recipes verified');
