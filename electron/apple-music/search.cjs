const { searchAppleWeb } = require('./webSearch.cjs');
const regions = require('../../shared/appleSearchRegions.json').regions;

// electron/apple-music/search.cjs
// A snapshot combines independent sources once, then pages locally (Apple Search has no offset).
function createAppleSearch({ fetch, searchLibrary, register, now = Date.now }) {
  const cache = new Map();
  const pending = new Map();
  const norm = value => String(value || '').normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
  async function catalogSearch(term, region) {
    const url = new URL('https://itunes.apple.com/search');
    url.search = new URLSearchParams({ term, country: region.toLowerCase(), media: 'music', entity: 'song', limit: '200' }).toString();
    let items;
    let web = region === 'CN';
    if (!web) {
      try {
        const response = await fetch(url.toString(), { signal: AbortSignal.timeout(15000) });
        if (!response.ok) throw new Error(`Apple 目录 HTTP ${response.status}`);
        const payload = await response.json();
        if (!Array.isArray(payload.results)) throw new Error('Apple 目录响应格式错误');
        items = payload.results;
        web = items.length === 0;
      } catch { web = true; }
    }
    if (web) items = await searchAppleWeb({ fetch, term, region });
    const resources = items.filter(item => item.trackId && item.trackName).map(item => ({
      id: `catalog:${region}:${item.trackId}`, type: 'songs', attributes: {
        name: item.trackName, artistName: item.artistName, albumName: item.collectionName,
        durationInMillis: item.trackTimeMillis, url: item.trackViewUrl,
        playParams: { catalogId: String(item.trackId) },
        artwork: item.artworkUrl100 ? { url: item.artworkUrl100.replace('100x100bb', '1200x1200bb') } : undefined,
      },
    }));
    if (web && resources.length) resources.warning = '当前地区仅返回部分目录结果，可细化歌名或歌手继续搜索。';
    return resources;
  }
  async function snapshot(term, region, alternate) {
    const [library, catalog] = await Promise.allSettled([
      searchLibrary({ term, limit: 100, offset: 0 }), catalogSearch(term, region),
    ]);
    if (library.status === 'rejected' && catalog.status === 'rejected') {
      throw new Error(`搜索失败：${catalog.reason.message}；资料库：${library.reason.message}`);
    }
    let extras = catalog.status === 'fulfilled' ? catalog.value : [];
    const catalogWarning = extras.warning;
    if (catalog.status === 'fulfilled' && extras.length < 5 && alternate && alternate !== term) {
      try { extras = extras.concat(await catalogSearch(alternate, region)); } catch { /* Primary results remain available. */ }
    }
    const data = [];
    for (const resource of [...(library.status === 'fulfilled' ? library.value.data || [] : []), ...extras]) {
      const a = resource.attributes || {};
      if (data.some(other => {
        const b = other.attributes || {};
        return norm(a.name) === norm(b.name) && norm(a.artistName) === norm(b.artistName)
          && Math.abs((a.durationInMillis || 0) - (b.durationInMillis || 0)) < 3000;
      })) continue;
      data.push(resource);
    }
    return { data, warning: catalog.status === 'rejected'
      ? `Apple 目录暂不可用，仅显示资料库：${catalog.reason.message}`
      : library.status === 'rejected' ? '资料库查询暂不可用，已显示 Apple 目录结果。' : catalogWarning };
  }
  return async function search(query, requestedRegion) {
    const region = String(requestedRegion || 'CN').toUpperCase();
    if (!regions.includes(region)) throw new Error('不支持的 Apple Music 搜索地区');
    const term = String(query.term || '').trim();
    if (!term) return { data: [], meta: { total: 0 } };
    const alternate = String(query.alternateTerm || '').trim();
    const offset = Math.max(0, Math.floor(Number(query.offset) || 0));
    const key = JSON.stringify([region, norm(term), norm(alternate)]);
    let entry = cache.get(key);
    if (!entry && offset > 0) throw new Error('搜索结果已过期，请重新搜索后继续。');
    // Existing pages keep their original snapshot, even after the refresh TTL.
    if (!entry || (offset === 0 && now() - entry.at > 180000)) {
      if (!pending.has(key)) pending.set(key, snapshot(term, region, alternate).then(value => {
        const result = { ...value, at: now() };
        cache.set(key, result);
        if (cache.size > 32) cache.delete(cache.keys().next().value);
        return result;
      }).finally(() => pending.delete(key)));
      entry = await pending.get(key);
    }
    const limit = Math.max(1, Math.min(100, Math.floor(Number(query.limit) || 25)));
    const data = entry.data.slice(offset, offset + limit);
    for (const item of data) if (item.id.startsWith('catalog:')) register(item);
    return { data, ...(offset + data.length < entry.data.length ? { next: 'search-next' } : {}),
      meta: { total: entry.data.length, warning: entry.warning } };
  };
}
module.exports = { createAppleSearch };
