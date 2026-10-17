import { _electron } from '@playwright/test';
import path from 'node:path';

// scripts/apple-music/smoke-packaged.mjs
const profile = path.resolve('test-results/apple-music-packaged/userdata');
const app = await _electron.launch({ executablePath: '/Applications/Folia Apple Music.app/Contents/MacOS/Folia Apple Music',
    args: [`--user-data-dir=${profile}`], timeout: 30000 });
const actual = await app.evaluate(({ app }) => app.getPath('userData'));
if (actual !== profile) { await app.close(); throw new Error('Refusing a non-isolated test profile'); }
const page = await app.firstWindow();
page.on('pageerror', error => console.log('PAGE ERROR:', error.message));
page.on('console', message => { if (message.type() === 'error') console.log('CONSOLE ERROR:', message.text()); });
page.on('requestfailed', request => console.log('FAILED:', request.url().split('?')[0], request.failure()?.errorText));
await page.waitForTimeout(3000);
console.log('body:', (await page.locator('body').innerText()).slice(0, 500));
console.log('bridge:', await page.evaluate(() => typeof window.electron?.appleMusicRequest));
const connected = await page.evaluate(() => window.electron.appleMusicRequest('authorize'));
console.log('connected:', connected.ok, connected.error?.code || '');
if (connected.ok) {
    const library = await page.evaluate(() => window.electron.appleMusicRequest('api', { path: '/v1/me/library/songs', query: { limit: '2', offset: '0' } }));
    console.log('library:', JSON.stringify({ ok: library.ok, total: library.data?.meta?.total, covers: library.data?.data?.filter(item => item.attributes?.artwork).length, error: library.error }));
    const id = library.data?.data?.[0]?.id;
    if (id) {
        const started = await page.evaluate(id => window.electron.appleMusicRequest('play', { mediaId: id }), id);
        await page.waitForTimeout(1800);
        const playing = await page.evaluate(() => window.electron.appleMusicRequest('state'));
        const sought = await page.evaluate(() => window.electron.appleMusicRequest('seek', { time: 35 }));
        const paused = await page.evaluate(() => window.electron.appleMusicRequest('pause'));
        console.log('transport:', JSON.stringify({ started: started.ok, playing: playing.data?.playing, progress: playing.data?.time,
            duration: playing.data?.duration, seek: sought.data?.time, paused: paused.ok && !paused.data?.playing, errors: [started.error, playing.error, sought.error, paused.error].filter(Boolean) }));
    }
}
await page.screenshot({ path: 'test-results/apple-music-packaged/startup.png' });
await app.close();
