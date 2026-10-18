import { _electron } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { extractFile } from '@electron/asar';

// scripts/apple-music/verify-search.mjs
// Live CN/TR checks against the installed DMG payload; never send playback commands.
const executable = process.env.FOLIA_TEST_APP || path.resolve('release/apple-music/mac-arm64/Folia Apple Music.app/Contents/MacOS/Folia Apple Music');
const profile = path.resolve(`test-results/apple-search-${Date.now()}/userdata`);
await fs.mkdir(path.dirname(profile), { recursive: true });
const app = await _electron.launch({ executablePath: executable, args: [`--user-data-dir=${profile}`], timeout: 60000 });
try {
  if (await app.evaluate(({ app }) => app.getPath('userData')) !== profile) throw new Error('Expected isolated profile');
  const page = await app.firstWindow();
  await page.waitForFunction(() => typeof window.electron?.appleMusicRequest === 'function', null, { timeout: 30000 });
  await page.waitForFunction(async () => {
    if (!(await window.electron.appleMusicRequest('status')).data?.authorized) return false;
    return (await window.electron.appleMusicRequest('api', { path: '/v1/me/library/songs', query: { limit: '1' } })).ok;
  }, null, { timeout: 90000, polling: 1000 });
  const archive = path.resolve(path.dirname(executable), '../Resources/app.asar');
  const regions = JSON.parse(extractFile(archive, 'shared/appleSearchRegions.json').toString());
  if (regions.defaultRegion !== 'CN' || !regions.regions.includes('TR') || regions.regions.length !== 172) throw new Error('Invalid region defaults');
  const results = await page.evaluate(async () => {
    const result = [];
    let reconnected = false;
    const request = async params => {
      let response = await window.electron.appleMusicRequest('api', params);
      if (!response.ok && response.error?.code === 'auth-required' && !reconnected) {
        // Search coverage is separate from the automatic-startup check. Record any reconnect.
        reconnected = true;
        const authorization = await window.electron.appleMusicRequest('authorize');
        if (!authorization.ok) throw new Error(authorization.error?.message || 'Reconnect failed');
        response = await window.electron.appleMusicRequest('api', params);
      }
      return response;
    };
    for (const [region, term, alternateTerm] of [['cn', '陈奕迅', 'Eason Chan'], ['tr', '周杰伦', 'Jay Chou'], ['tr', 'Eason Chan', '陈奕迅']]) {
      const query = { term, alternateTerm, limit: '25', offset: '0' };
      const response = await request({ path: `/v1/catalog/${region}/search`, query });
      if (!response.ok) throw new Error(response.error?.message || 'Search failed');
      const first = response.data.results.songs;
      const ids = first.data.map(song => song.id);
      let secondCount = 0;
      if (first.next) {
        const second = await request({ path: `/v1/catalog/${region}/search`, query: { ...query, offset: String(first.data.length) } });
        if (!second.ok) throw new Error('Pagination failed');
        secondCount = second.data.results.songs.data.length;
        ids.push(...second.data.results.songs.data.map(song => song.id));
      }
      result.push({ region: region.toUpperCase(), term, count: first.data.length, total: first.meta.total,
        secondCount, unique: new Set(ids).size === ids.length, sameRegion: first.data.every(song => !song.id.startsWith('catalog:') || song.id.startsWith(`catalog:${region.toUpperCase()}:`)), warning: first.meta.warning || null });
    }
    return { cases: result, reconnected };
  });
  if (results.cases.some(result => !result.count || !result.unique || !result.sameRegion)) throw new Error('Regional search validation failed');
  const checks = { version: JSON.parse(extractFile(archive, 'package.json').toString()).version, defaultRegion: regions.defaultRegion,
    availableRegions: regions.regions.length, audioUntouched: true, reconnected: results.reconnected, results: results.cases };
  await fs.writeFile('release-materials/SEARCH_CHECKS.json', JSON.stringify(checks, null, 2) + '\n');
  console.log(JSON.stringify(checks));
} finally { await app.close(); }
