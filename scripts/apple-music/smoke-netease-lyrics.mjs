import { _electron } from '@playwright/test';
import path from 'node:path';

// scripts/apple-music/smoke-netease-lyrics.mjs
const profile = path.resolve('test-results/apple-music-netease/userdata');
const app = await _electron.launch({ executablePath: '/Applications/Folia Apple Music.app/Contents/MacOS/Folia Apple Music', args: [`--user-data-dir=${profile}`] });
try {
    if (await app.evaluate(({ app }) => app.getPath('userData')) !== profile) throw new Error('Expected isolated profile');
    const page = await app.firstWindow();
    await page.waitForFunction(() => typeof window.electron?.neteaseLyricsRequest === 'function');
    const result = await page.evaluate(async () => {
        const search = await window.electron.neteaseLyricsRequest('search', { keywords: '陈奕迅 富士山下' });
        if (!search.ok) return { ok: false, error: search.error };
        const song = search.data.songs.find(s => s.artists.some(a => a.name === '陈奕迅'));
        if (!song) return { ok: false, error: 'No original recording' };
        const lyrics = await window.electron.neteaseLyricsRequest('lyrics', { id: String(song.id) });
        return { ok: lyrics.ok, hasLines: Boolean(lyrics.data?.lrc?.lyric), hasWordTiming: Boolean(lyrics.data?.yrc?.lyric), appleMusicBridgePresent: typeof window.electron.appleMusicRequest === 'function', error: lyrics.error };
    });
    console.log(JSON.stringify(result));
    if (!result.ok || !result.hasLines) throw new Error('Packaged lyrics smoke test failed');
} finally { await app.close(); }
