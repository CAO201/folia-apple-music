// electron/apple-music/externalLyrics.cjs
// Public, read-only lyric endpoints. No account credentials, audio URLs or playback operations.
function createExternalLyrics(fetcher = fetch) {
  const cache = new Map();
  const lrclibLyrics = new Map();
  async function get(host, route, query, headers = {}) {
    const url = new URL(route, `https://${host}`);
    url.search = new URLSearchParams(query).toString();
    const response = await fetcher(url.toString(), { headers, signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error(`Lyrics HTTP ${response.status}`);
    const text = await response.text();
    if (text.length > 2_000_000) throw new Error('Lyric response too large');
    return JSON.parse(text);
  }
  const qqHeaders = { Referer: 'https://y.qq.com/', 'User-Agent': 'Mozilla/5.0' };
  const clean = value => String(value || '').replace(/<[^>]*>/g, '').slice(0, 300);
  const song = (id, name, artist, album, durationMs, extra = {}) => ({ id, name: clean(name),
    artists: String(artist || '').split(/、|\s*\/\s*/).filter(Boolean).map((name, id) => ({ id, name: clean(name) })),
    album: { id: 0, name: clean(album) }, durationMs: Number(durationMs), ...extra });
  async function run(operation, params) {
    const { provider } = params;
    const query = String(params.keywords || '').trim().slice(0, 200);
    const id = String(params.id || '');
    if (!['qq', 'kugou', 'lrclib'].includes(provider)) throw new Error('Unsupported lyric source');
    if (operation === 'external-search') {
      if (!query) throw new Error('Missing search terms');
      if (provider === 'qq') {
        const data = await get('c.y.qq.com', '/soso/fcgi-bin/client_search_cp', { w: query, format: 'json', p: '1', n: '15' }, qqHeaders);
        if (data.code !== 0) throw new Error('QQ lyric search unavailable');
        return { songs: (data.data?.song?.list || []).map(item => song(item.songmid, item.songname,
          (item.singer || []).map(a => a.name).join('、'), item.albumname, item.interval * 1000)) };
      }
      if (provider === 'kugou') {
        const data = await get('mobiles.kugou.com', '/api/v3/search/song', { keyword: query, pagesize: '15', page: '1' });
        if (data.status !== 1 || data.errcode) throw new Error('KuGou lyric search unavailable');
        return { songs: (data.data?.info || []).map(item => song(item.hash, item.songname, item.singername,
          item.album_name, item.duration * 1000)) };
      }
      const data = await get('lrclib.net', '/api/search', { q: query });
      if (!Array.isArray(data)) throw new Error('LRCLIB lyric search unavailable');
      for (const item of data.slice(0, 30)) lrclibLyrics.set(String(item.id), { at: Date.now(), text: String(item.syncedLyrics || '') });
      while (lrclibLyrics.size > 200) lrclibLyrics.delete(lrclibLyrics.keys().next().value);
      return { songs: data.slice(0, 30).map(item => song(item.id, item.trackName, item.artistName, item.albumName, item.duration * 1000)) };
    }
    if (operation !== 'external-lyrics') throw new Error('Unsupported lyrics operation');
    if (provider === 'qq') {
      if (!/^[a-zA-Z0-9]{8,32}$/.test(id)) throw new Error('Invalid QQ song ID');
      const data = await get('c.y.qq.com', '/lyric/fcgi-bin/fcg_query_lyric_new.fcg', { songmid: id, format: 'json', nobase64: '1' }, qqHeaders);
      if (data.code !== 0 || data.retcode !== 0) throw new Error('QQ lyrics unavailable');
      return { text: data.lyric || '', translation: data.trans || '', format: 'lrc' };
    }
    if (provider === 'lrclib') {
      if (!/^\d{1,15}$/.test(id)) throw new Error('Invalid LRCLIB ID');
      const cached = lrclibLyrics.get(id);
      if (cached && Date.now() - cached.at < 300000) return { text: cached.text, format: 'lrc' };
      const data = await get('lrclib.net', `/api/get/${id}`, {});
      return { text: data.syncedLyrics || '', format: 'lrc' };
    }
    if (!/^[a-f0-9]{32}$/i.test(id)) throw new Error('Invalid KuGou song hash');
    const duration = Number(params.durationMs);
    if (!Number.isFinite(duration) || duration <= 0) throw new Error('Missing song duration');
    const data = await get('lyrics.kugou.com', '/search', { ver: '1', man: 'yes', client: 'pc', keyword: query,
      duration: String(duration), hash: id });
    if (data.status !== 200) throw new Error('KuGou lyric candidates unavailable');
    // Return metadata with the download; the renderer validates the lyric recording separately.
    const candidates = (data.candidates || []).filter(c => Math.abs(Number(c.duration) - duration) <= 4000).slice(0, 3);
    const downloads = [];
    for (const candidate of candidates) {
      if (!/^\d+$/.test(String(candidate.id)) || !/^[a-z0-9]+$/i.test(String(candidate.accesskey))) continue;
      const result = await get('lyrics.kugou.com', '/download', { ver: '1', client: 'pc', fmt: 'krc', charset: 'utf8',
        id: String(candidate.id), accesskey: String(candidate.accesskey) });
      if (result.status === 200 && result.content) downloads.push({ content: result.content, contenttype: result.contenttype,
        song: song(candidate.id, candidate.song, candidate.singer, '', candidate.duration) });
    }
    return { downloads };
  }
  return { async request(operation, params = {}) {
    const key = JSON.stringify([operation, params]);
    const cached = cache.get(key);
    if (cached && cached.expires > Date.now()) return cached.job;
    const job = run(operation, params);
    cache.set(key, { job, expires: Date.now() + 300000 });
    if (cache.size > 200) cache.delete(cache.keys().next().value);
    try { return await job; } catch (error) { cache.delete(key); throw error; }
  } };
}
module.exports = { createExternalLyrics };
