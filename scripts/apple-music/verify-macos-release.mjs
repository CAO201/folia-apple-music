import { _electron } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { extractFile } from '@electron/asar';

// scripts/apple-music/verify-macos-release.mjs
// Fresh-profile startup verification; no play/pause/seek operation is sent to the user's Music app.
const executable = process.env.FOLIA_TEST_APP || path.resolve('release/apple-music/mac-arm64/Folia Apple Music.app/Contents/MacOS/Folia Apple Music');
const profile = path.resolve(`test-results/apple-release-fresh-${Date.now()}/userdata`);
await fs.mkdir(path.dirname(profile), { recursive: true });
const app = await _electron.launch({ executablePath: executable, args: [`--user-data-dir=${profile}`], timeout: 180000 });
const result = { freshProfile: false, window: false, automaticConnection: false, libraryReadable: false, lyrics: false,
  updateDisabled: false, originalLicensePresent: false, audioUntouched: true };
try {
  result.freshProfile = (await app.evaluate(({ app }) => app.getPath('userData'))) === profile;
  if (!result.freshProfile) throw new Error('Expected isolated profile');
  const page = await app.firstWindow();
  await page.waitForFunction(() => typeof window.electron?.appleMusicRequest === 'function', null, { timeout: 30000 });
  result.window = true;
  await page.waitForFunction(async () => (await window.electron.appleMusicRequest('status')).data?.authorized, null, { timeout: 90000 });
  result.automaticConnection = true;
  const checks = await page.evaluate(async () => {
    const statusBefore = await window.electron.appleMusicRequest('status');
    const library = await window.electron.appleMusicRequest('api', { path: '/v1/me/library/songs', query: { limit: '2', offset: '0' } });
    const updates = await window.electron.getUpdateStatus();
    const search = await window.electron.neteaseLyricsRequest('search', { keywords: '陈奕迅 富士山下' });
    let hasLyrics = false;
    if (search.ok) {
      const song = search.data.songs.find(s => s.name === '富士山下' && s.artists.some(a => a.name === '陈奕迅'));
      if (song) { const lyrics = await window.electron.neteaseLyricsRequest('lyrics', { id: String(song.id) }); hasLyrics = Boolean(lyrics.ok && lyrics.data?.lrc?.lyric); }
    }
    return { statusBefore, statusAfter: await window.electron.appleMusicRequest('status'), libraryReadable: Boolean(library.ok && Array.isArray(library.data?.data)), hasTracks: Boolean(library.data?.data?.length), libraryError: library.error,
      updateDisabled: updates.updateCheckSupported === false, lyrics: hasLyrics, lyricsError: search.ok ? undefined : search.error };
  });
  Object.assign(result, checks);
  const archive = path.resolve(path.dirname(executable), '../Resources/app.asar');
  result.originalLicensePresent = ['LICENSE', 'NOTICE.md', 'THIRD_PARTY_NOTICES.md'].every(name => extractFile(archive, name).length > 0);
  await page.screenshot({ path: path.join(path.dirname(profile), 'startup.png') });
  await fs.writeFile('release-materials/verification-result.json', JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result));
  if (!result.window || !result.libraryReadable || !result.automaticConnection || !result.updateDisabled || !result.originalLicensePresent) throw new Error('Release verification failed');
} finally { await app.close(); }
