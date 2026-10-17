import fs from 'node:fs/promises';
import path from 'node:path';

// scripts/apple-music/collect-licenses.mjs
// Include installed frontend and backend dependencies, keeping their original license texts unchanged.
const root = process.cwd();
const output = path.join(root, 'release-materials/licenses');
await fs.mkdir(output, { recursive: true });
const records = [];
async function scan(modules) {
  for (const item of await fs.readdir(modules, { withFileTypes: true }).catch(() => [])) {
    if (item.name.startsWith('.')) continue;
    const directory = path.join(modules, item.name);
    if (item.name.startsWith('@')) { await scan(directory); continue; }
    if (!item.isDirectory()) continue;
    const pkg = await fs.readFile(path.join(directory, 'package.json'), 'utf8').then(JSON.parse).catch(() => null);
    if (!pkg?.name) continue;
    const name = `${pkg.name.replace(/[^a-zA-Z0-9._-]/g, '_')}-${pkg.version}`;
    const destination = path.join(output, name);
    const names = (await fs.readdir(directory)).filter(value => /^(license|licence|copying|notice|authors)(\.|$|-)/i.test(value));
    await fs.mkdir(destination, { recursive: true });
    const copied = [];
    for (const filename of names) {
      if (!(await fs.stat(path.join(directory, filename))).isFile()) continue;
      await fs.copyFile(path.join(directory, filename), path.join(destination, filename)); copied.push(filename);
    }
    const repository = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url || pkg.homepage || '';
    const record = { name: pkg.name, version: pkg.version, license: pkg.license || pkg.licenses || 'See package metadata', repository, files: copied };
    await fs.writeFile(path.join(destination, 'package-notice.json'), JSON.stringify(record, null, 2) + '\n');
    records.push(record);
    await scan(path.join(directory, 'node_modules'));
  }
}
await scan(path.join(root, 'node_modules'));
for (const name of ['LICENSE', 'LICENSES.chromium.html']) {
  const file = path.join(root, 'node_modules/electron/dist', name);
  if (await fs.stat(file).catch(() => null)) await fs.copyFile(file, path.join(output, `Electron-${name}`));
}
await fs.writeFile(path.join(output, 'INDEX.json'), JSON.stringify(records, null, 2) + '\n');
console.log(`Collected ${records.length} dependency notices`);
