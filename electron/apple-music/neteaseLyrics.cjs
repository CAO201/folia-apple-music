// electron/apple-music/neteaseLyrics.cjs
// A lyrics-only allowlist: this module never loads a song URL, logs in, or registers a playback provider.
function createNeteaseLyricsBridge({ fetcher } = {}) {
  const external = require('./externalLyrics.cjs').createExternalLyrics(fetcher);
  const localized = require('./lyricMetadata.cjs').createLyricMetadata(fetcher);
  const cache = new Map();
  let cooldownUntil = 0;
  const moduleBase = '@neteasecloudmusicapienhanced/api';
  async function request(operation, params = {}) {
    if (operation === 'external-search' || operation === 'external-lyrics') return external.request(operation, params);
    if (operation === 'localized') return localized(params);
    if (!['search', 'lyrics', 'detail'].includes(operation)) throw new Error('Unsupported lyrics operation');
    const keywords = String(params.keywords || '').trim().slice(0, 200);
    const id = String(params.id || '');
    if (operation === 'search' && !keywords) throw new Error('Missing lyric search terms');
    if (operation !== 'search' && !/^\d{1,20}$/.test(id)) throw new Error('Invalid NetEase lyric ID');
    const key = `${operation}:${operation === 'search' ? keywords : id}`;
    if (cache.has(key) && cache.get(key).expires > Date.now()) return cache.get(key).job;
    if (Date.now() < cooldownUntil) throw new Error('网易云请求暂时受限，请稍后重试。');
    const job = (async () => {
      const transport = require(`${moduleBase}/util/request.js`);
      const endpoint = require(`${moduleBase}/module/${operation === 'search' ? 'cloudsearch' : operation === 'detail' ? 'song_detail' : 'lyric_new'}.js`);
      const response = await endpoint({ ...(operation === 'search' ? { keywords, type: 1, limit: 30, offset: 0 } : (operation === 'detail' ? { ids: id } : { id })),
        cookie: {}, crypto: 'weapi', timeout: 8000 }, transport);
      const body = response.body;
      if (body?.code !== 200) throw new Error(`网易云歌词请求失败（${body?.code || response.status}）`);
      if (operation === 'lyrics') return Object.fromEntries(['code', 'lrc', 'yrc', 'tlyric', 'ytlrc', 'romalrc', 'yromalrc', 'nolyric', 'uncollected', 'pureMusic']
        .filter(key => body[key] !== undefined).map(key => [key, body[key]]));
      return { songs: (body.result?.songs || body.songs || []).map(song => ({ id: song.id, name: song.name, durationMs: song.dt,
        artists: (song.ar || []).map(artist => ({ id: artist.id, name: artist.name })),
        album: { id: song.al?.id || 0, name: song.al?.name || '' } })) };
    })();
    cache.set(key, { job, expires: Date.now() + 300000 });
    if (cache.size > 200) cache.delete(cache.keys().next().value);
    try { return await job; } catch (error) {
      cache.delete(key);
      const code = error?.body?.code || error?.status;
      if ([405, 429].includes(Number(code))) {
        cooldownUntil = Date.now() + 30000;
        throw new Error('网易云提示操作频繁，已暂停请求，请 30 秒后重试。');
      }
      throw new Error(error?.body?.message || error?.body?.msg || error?.message || '网易云歌词请求失败，请重试。');
    }
  }
  return { request };
}
module.exports = { createNeteaseLyricsBridge };
