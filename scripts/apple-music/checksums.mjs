import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

// scripts/apple-music/checksums.mjs
const directory = path.resolve('release/apple-music');
const lines = [];
for (const name of (await fs.readdir(directory)).sort()) {
  if (!/\.(?:dmg|zip)$/.test(name)) continue;
  lines.push(`${createHash('sha256').update(await fs.readFile(path.join(directory, name))).digest('hex')}  ${name}`);
}
if (!lines.length) throw new Error('No release assets to hash');
await fs.writeFile(path.join(directory, 'SHA256SUMS.txt'), lines.join('\n') + '\n');
console.log(lines.join('\n'));
