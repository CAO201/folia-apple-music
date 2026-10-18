// electron/apple-music/webSearch.cjs
// Read the public Apple Music page, then resolve its song IDs through Apple's public lookup API.
// No account token, preview audio, private endpoint or alternate storefront is used.
async function searchAppleWeb({ fetch, term, region }) {
  const url = new URL(`https://music.apple.com/${region.toLowerCase()}/search`);
  url.searchParams.set('term', term);
  const page = await fetch(url.toString(), { signal: AbortSignal.timeout(15000) });
  if (!page.ok) throw new Error(`Apple Music 网页 HTTP ${page.status}`);
  const html = await page.text();
  const script = html.match(/<script\b[^>]*\bid=["']serialized-server-data["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!script) throw new Error('Apple Music 网页格式已变化，请稍后重试或更新应用。');
  const payload = JSON.parse(script[1]);
  const record = payload.data?.find(item => item.intent?.$kind === 'SearchResultsPageIntent'
    && item.intent?.storefront?.toUpperCase() === region);
  if (!record || !Array.isArray(record.data?.sections)) throw new Error('无法读取所选地区的 Apple Music 搜索结果。');
  const ids = [...new Set(record.data.sections.flatMap(section => section.items || [])
    .filter(item => item.contentDescriptor?.kind === 'song')
    .map(item => String(item.contentDescriptor.identifiers?.storeAdamID || ''))
    .filter(id => /^\d+$/.test(id)))].slice(0, 200);
  if (!ids.length) return [];
  const lookup = new URL('https://itunes.apple.com/lookup');
  lookup.search = new URLSearchParams({ id: ids.join(','), country: region.toLowerCase(), entity: 'song', limit: '200' }).toString();
  const response = await fetch(lookup.toString(), { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Apple 歌曲信息 HTTP ${response.status}`);
  const details = await response.json();
  if (!Array.isArray(details.results)) throw new Error('无法读取 Apple 歌曲信息。');
  const songs = new Map(details.results.filter(item => item.kind === 'song').map(item => [String(item.trackId), item]));
  if (!songs.size) throw new Error('Apple 暂未返回当前地区的歌曲信息，请稍后重试。');
  return ids.map(id => songs.get(id)).filter(Boolean);
}
module.exports = { searchAppleWeb };
