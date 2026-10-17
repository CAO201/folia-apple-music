// electron/apple-music/lyricMetadata.cjs
// Read-only Apple catalog identities for lyric matching; no audio or preview URL is returned.
function createLyricMetadata(fetcher = fetch) {
  const cache = new Map();
  const normalize = text => String(text || '').normalize('NFKC').toLowerCase().replace(/[\p{P}\p{S}\s]/gu, '');
  async function get(endpoint, params) {
    const url = new URL(`https://itunes.apple.com/${endpoint}`);
    url.search = new URLSearchParams(params).toString();
    const response = await fetcher(url.toString(), { signal: AbortSignal.timeout(7000) });
    if (!response.ok) throw new Error(`Apple 歌曲信息请求失败 (${response.status})`);
    return (await response.json()).results || [];
  }
  async function localized(params) {
    const title = String(params.title || '').slice(0, 200), artist = String(params.artist || '').slice(0, 200);
    const duration = Number(params.durationMs), key = `${title}\0${artist}\0${duration}\0${params.catalogId || ''}`;
    if (cache.has(key)) return cache.get(key);
    const job = (async () => {
      let id = String(params.catalogId || '').replace(/^catalog:/, '');
      if (!/^\d+$/.test(id)) {
        const candidates = await get('search', { term: `${title} ${artist}`, country: 'us', media: 'music', entity: 'song', limit: '15' });
        const matches = candidates.filter(item => normalize(item.trackName) === normalize(title)
          && normalize(item.artistName) === normalize(artist) && duration > 0 && Math.abs(item.trackTimeMillis - duration) <= 3000);
        const identities = new Set(matches.map(item => item.trackId));
        if (identities.size !== 1) return { songs: [] };
        id = String(matches[0].trackId);
      }
      const results = await Promise.allSettled(['cn', 'tw'].map(country => get('lookup', { id, country, entity: 'song' })));
      return { songs: results.flatMap(result => result.status === 'fulfilled' ? result.value : [])
        .filter(item => item.kind === 'song' && String(item.trackId) === id && duration > 0 && Math.abs(item.trackTimeMillis - duration) <= 3000)
        .map(item => ({ id: item.trackId, name: item.trackName, durationMs: item.trackTimeMillis,
          artists: [{ id: item.artistId, name: item.artistName }], album: { id: item.collectionId, name: item.collectionName } })) };
    })();
    cache.set(key, job);
    if (cache.size > 200) cache.delete(cache.keys().next().value);
    try { return await job; } catch (error) { cache.delete(key); throw error; }
  }
  return localized;
}
module.exports = { createLyricMetadata };
