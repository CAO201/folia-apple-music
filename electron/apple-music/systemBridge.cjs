const { execFile } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const { createMusicArtwork } = require('./artwork.cjs');
const { createAppleSearch } = require('./search.cjs');

// electron/apple-music/systemBridge.cjs
// Music.app exposes its library and transport through its public scripting dictionary.
function createSystemMusicBridge({ app, store, shell, net, localCoverAssetStore, nativeImage }) {
  const artwork = createMusicArtwork({ app, localCoverAssetStore, nativeImage });
  let serial = Promise.resolve();
  let selected = '';
  let actualID = '';
  let lastTime = 0;
  let lastDuration = 0;
  let played = false;
  let disposed = false;
  const catalog = new Map();
  const coverCache = new Map();
  const failure = (code, message) => ({ ok: false, error: { code, message } });
  const call = (operation, params, timeout = 60000) => new Promise((resolve, reject) => {
    execFile('/usr/bin/osascript', ['-l', 'JavaScript', '-e', fs.readFileSync(path.join(__dirname, 'system.js'), 'utf8'), JSON.stringify({ operation, params })],
      { timeout, maxBuffer: 12 * 1024 * 1024, env: process.env }, (error, stdout) => {
        if (error) return reject(new Error(error.code === -1743 || error.message.includes('-1743')
          ? '请在系统设置 → 隐私与安全性 → 自动化中，允许 Folia Apple Music 控制“音乐”。'
          : error.killed ? '“音乐”App 响应超时，请打开“音乐”后重试。' : error.message));
        try { resolve(JSON.parse(stdout)); } catch { reject(new Error('无法读取“音乐”App 的响应。')); }
      });
  });
  const search = createAppleSearch({
    fetch: (...args) => net.fetch(...args),
    searchLibrary: params => call('search', params, 15000),
    register: resource => {
      catalog.set(resource.id, resource);
      if (catalog.size > 1000) catalog.delete(catalog.keys().next().value);
    },
  });
  async function searchCatalog(query) {
    const url = new URL('https://itunes.apple.com/search');
    url.search = new URLSearchParams({ term: query.term, country: 'cn', media: 'music', entity: 'song', limit: '25' }).toString();
    const response = await net.fetch(url.toString());
    if (!response.ok) throw new Error(`Apple catalog HTTP ${response.status}`);
    const payload = await response.json();
    return (payload.results || []).map(item => {
      const id = `catalog:${item.trackId}`;
      const resource = { id, type: 'songs', attributes: { name: item.trackName, artistName: item.artistName,
        albumName: item.collectionName, durationInMillis: item.trackTimeMillis,
        artwork: { url: item.artworkUrl100?.replace('100x100bb', '1200x1200bb') }, url: item.trackViewUrl } };
      catalog.set(id, resource);
      if (catalog.size > 500) catalog.delete(catalog.keys().next().value);
      return resource;
    });
  }
  async function enrich(resource) {
    if (!resource?.attributes || resource.attributes.artwork) return resource;
    const local = await artwork.get(resource);
    if (local) { resource.attributes.artwork = local; return resource; }
    const a = resource.attributes;
    const key = `${a.name}\0${a.artistName}`;
    if (coverCache.has(key)) { a.artwork = coverCache.get(key); return resource; }
    try {
      const candidates = await searchCatalog({ term: `${a.name} ${a.artistName}` });
      const match = candidates.find(r => r.attributes.name?.toLowerCase() === a.name?.toLowerCase()
        && r.attributes.artistName?.toLowerCase() === a.artistName?.toLowerCase());
      if (match?.attributes.artwork) { a.artwork = match.attributes.artwork; coverCache.set(key, a.artwork); }
      if (coverCache.size > 500) coverCache.delete(coverCache.keys().next().value);
    } catch { /* Missing cover never blocks a subscription song. */ }
    return resource;
  }
  async function execute(operation, params = {}) {
    if (disposed) return failure('unavailable', 'Apple Music bridge closed');
    if (operation === 'health') return { ok: true, data: { available: process.platform === 'darwin', signed: false, engine: 'system' } };
    if (operation === 'status') return { ok: true, data: { authorized: Boolean(store.get('APPLE_MUSIC_CONNECTED', false)), signed: true, engine: 'system' } };
    try {
      if (operation === 'authorize') {
        const data = await call('authorize', {});
        store.set('APPLE_MUSIC_CONNECTED', true);
        return { ok: true, data };
      }
      if (operation === 'logout') {
        if (actualID) await call('stop', { mediaId: actualID });
        selected = actualID = '';
        store.set('APPLE_MUSIC_CONNECTED', false);
        return { ok: true, data: {} };
      }
      if (!store.get('APPLE_MUSIC_CONNECTED', false)) return failure('auth-required', '请先连接 Apple Music，允许控制“音乐”App。');
      if (operation === 'storefront') return { ok: true, data: { id: 'cn' } };
      if (operation === 'api') {
        if (params.method && params.method !== 'GET') return failure('unsupported', '此接入方式仅浏览资料库，歌单编辑请使用“音乐”App。');
        const q = params.query || {};
        const p = params.path;
        let result;
        if (/\/search$/.test(p)) {
          result = { results: { songs: await search(q, p.match(/^\/v1\/catalog\/([^/]+)\/search$/)?.[1] || 'cn') } };
        } else if (p === '/v1/me/library/playlists') {
          result = await call('playlists', q);
        } else if (p === '/v1/me/library/albums') {
          result = await call('albums', q);
        } else if (p === '/v1/me/library/songs') {
          result = await call('tracks', { ...q, id: 'apple-library-songs' });
        } else if (/\/playlists\/[^/]+\/tracks$/.test(p)) {
          result = await call('tracks', { ...q, id: decodeURIComponent(p.split('/').at(-2)) });
        } else if (/\/albums\/[^/]+\/tracks$/.test(p)) {
          result = await call('albumTracks', { ...q, id: decodeURIComponent(p.split('/').at(-2)) });
        } else if (/\/songs\/[^/]+$/.test(p)) {
          const id = decodeURIComponent(p.split('/').at(-1));
          const resource = catalog.get(id) || (await call('detail', { id })).data[0];
          result = { data: [await enrich(resource)] };
        } else if (/\/charts$/.test(p)) {
          result = { results: { playlists: [] } };
        } else { return failure('unsupported', '此内容请在“音乐”App 中浏览。'); }
        if (Array.isArray(result.data)) {
          for (let i = 0; i < result.data.length; i += 4) {
            await Promise.all(result.data.slice(i, i + 4).map(async resource => {
              const cover = await artwork.get(resource);
              if (cover) resource.attributes.artwork = cover;
            }));
          }
        }
        if (result.hasMore) result.next = 'library-next';
        if (result.total !== undefined) result.meta = { total: result.total };
        return { ok: true, data: result };
      }
      if (operation === 'lyrics') {
        let id = String(params.mediaId || '');
        if (id.startsWith('catalog:')) {
          const resource = catalog.get(id);
          if (!resource) return { ok: true, data: { text: '', reason: 'not-in-library' } };
          const a = resource.attributes;
          const match = await call('resolve', { title: a.name, artist: a.artistName, duration: a.durationInMillis }, 15000);
          if (!match) return { ok: true, data: { text: '', reason: 'not-in-library' } };
          id = match.id;
        }
        if (!/^[A-F0-9]{16}$/i.test(id)) return failure('unsupported', '此歌曲的简介歌词当前无法读取。');
        return { ok: true, data: await call('lyrics', { id }, 15000) };
      }
      if (operation === 'play') {
        selected = params.mediaId;
        if (selected.startsWith('catalog:')) {
          const item = catalog.get(selected);
          if (!item) return failure('not-playable', '请重新搜索此歌曲。');
          const match = await call('resolve', { title: item.attributes.name, artist: item.attributes.artistName, duration: item.attributes.durationInMillis });
          if (!match) {
            if (item.attributes.url) await shell.openExternal(item.attributes.url);
            selected = actualID = '';
            return failure('not-playable', '已在“音乐”App 打开歌曲。请先加入资料库，再回到 Folia 刷新后播放。');
          }
          actualID = match.id;
        } else { actualID = selected; }
        lastTime = lastDuration = 0;
        played = false;
        const result = await call('play', { mediaId: actualID });
        played = result.playing;
        lastTime = result.time; lastDuration = result.duration;
        return { ok: true, data: { ...result, mediaId: selected } };
      }
      if (operation === 'volume') { await call('volume', params); return { ok: true, data: {} }; }
      if (!selected) return { ok: true, data: { mediaId: '', time: 0, duration: 0, playing: false, status: 'stopped' } };
      const state = await call(operation, { ...params, mediaId: actualID });
      if (operation === 'stop') { selected = actualID = ''; return { ok: true, data: state }; }
      // Music can advance its own queue; surface an end, never attach another song's clock to the selected lyrics.
      if (state.mediaId !== actualID || (state.status === 'stopped' && played)) {
        return { ok: true, data: { mediaId: selected, time: lastDuration || lastTime, duration: lastDuration, playing: false, status: 'ended' } };
      }
      played ||= state.playing;
      lastTime = state.time; lastDuration = state.duration;
      return { ok: true, data: { ...state, mediaId: selected } };
    } catch (error) { return failure('unavailable', error.message); }
  }
  function request(operation, params) {
    if (operation === 'api' || operation === 'lyrics') return execute(operation, params);
    const result = serial.then(() => execute(operation, params));
    serial = result.catch(() => {});
    return result;
  }
  return { request, dispose: () => { disposed = true; } };
}
module.exports = { createSystemMusicBridge };
