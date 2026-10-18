import { _electron } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { extractFile } from '@electron/asar';

// scripts/apple-music/verify-lyrics.mjs
// Read-only packaged IPC checks. Never save library lyrics or send play/pause/seek commands.
const executable = process.env.FOLIA_TEST_APP || path.resolve('release/apple-music/mac-arm64/Folia Apple Music.app/Contents/MacOS/Folia Apple Music');
const profile = path.resolve(`test-results/apple-lyrics-${Date.now()}/userdata`);
await fs.mkdir(path.dirname(profile), { recursive: true });
const app = await _electron.launch({ executablePath: executable, args: [`--user-data-dir=${profile}`], timeout: 60000 });
try {
  if (await app.evaluate(({ app }) => app.getPath('userData')) !== profile) throw new Error('Expected isolated profile');
  const page = await app.firstWindow();
  await page.waitForFunction(() => typeof window.electron?.appleMusicRequest === 'function', null, { timeout: 30000 });
  await page.waitForFunction(async () => (await window.electron.appleMusicRequest('status')).data?.authorized, null, { timeout: 90000, polling: 1000 });
  const result = await page.evaluate(async () => {
    let reconnected = false;
    const operations = [];
    const request = async (operation, params) => {
      operations.push(operation);
      let response = await window.electron.appleMusicRequest(operation, params);
      if (!response.ok && response.error?.code === 'auth-required' && !reconnected) {
        reconnected = true; operations.push('authorize');
        const auth = await window.electron.appleMusicRequest('authorize');
        if (!auth.ok) throw new Error('Reconnect failed');
        response = await window.electron.appleMusicRequest(operation, params);
      }
      return response;
    };
    const library = await request('api', { path:'/v1/me/library/songs', query:{limit:'3',offset:'0'} });
    if (!library.ok || !library.data.data.length) throw new Error('Library unavailable');
    const samples = [];
    for (const song of library.data.data) {
      const response = await request('lyrics', {mediaId:song.id});
      if (!response.ok || typeof response.data?.text !== 'string' || response.data?.song?.id !== song.id) throw new Error('Lyric identity/read check failed');
      samples.push({ok:true,characters:response.data.text.length,timedTextDetected:/\[\d+:\d+|<tt[\s>]/.test(response.data.text)});
    }
    return {samples,reconnected,requestedOperations:[...new Set(operations)]};
  });
  const archive = path.resolve(path.dirname(executable), '../Resources/app.asar');
  const version = JSON.parse(extractFile(archive, 'package.json').toString()).version;
  const checks = {version,isolatedProfile:true,...result,cloudLyricsIncluded:false,playbackCommandsSent:false};
  await fs.writeFile('release-materials/LYRIC_CHECKS.json', JSON.stringify(checks,null,2)+'\n');
  console.log(JSON.stringify(checks));
} finally { await app.close(); }
