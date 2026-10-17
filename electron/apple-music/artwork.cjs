const fs = require('node:fs/promises');
const readFileSync = require('node:fs').readFileSync;
const path = require('node:path');
const { execFile } = require('node:child_process');
const { createHash } = require('node:crypto');

// electron/apple-music/artwork.cjs
function createMusicArtwork({ app, localCoverAssetStore, nativeImage }) {
  const cache = new Map();
  async function get(resource) {
    const id = resource.id.replace(/^album:/, '');
    if (!/^[a-f0-9]{16}$/i.test(id)) return null;
    const key = `${resource.type}:${id}`;
    if (cache.has(key)) return cache.get(key);
    const job = (async () => {
      const directory = path.join(app.getPath('temp'), 'folia-apple-music-artwork');
      await fs.mkdir(directory, { recursive: true });
      const destination = path.join(directory, `${id}-${Date.now()}.image`);
      try {
        await new Promise((resolve, reject) => execFile('/usr/bin/osascript', ['-e', readFileSync(path.join(__dirname, 'artwork.applescript'), 'utf8'), id,
          resource.type.includes('playlist') ? 'playlist' : 'track', destination], { timeout: 10000 }, error => error ? reject(error) : resolve()));
        const data = await fs.readFile(destination);
        const image = nativeImage.createFromBuffer(data);
        if (image.isEmpty()) return null;
        const bytes = image.resize({ width: 1024, quality: 'good' }).toJPEG(85);
        const assetId = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
        if (!await localCoverAssetStore.has(assetId)) await localCoverAssetStore.write(assetId, bytes, 'image/jpeg');
        return { url: `folia-cover://asset/${encodeURIComponent(assetId)}` };
      } catch { return null; }
      finally { await fs.rm(destination, { force: true }); }
    })();
    cache.set(key, job);
    if (cache.size > 1000) cache.delete(cache.keys().next().value);
    return job;
  }
  return { get };
}
module.exports = { createMusicArtwork };
