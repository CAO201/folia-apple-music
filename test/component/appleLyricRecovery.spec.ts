import { expect, test } from './fixtures';

// test/component/appleLyricRecovery.spec.ts
// Deterministic fixtures; never sends commands to Music.app or public lyric servers.
test.beforeEach(async ({page})=>{await page.addInitScript(()=>localStorage.setItem('folia_app_language','en'));});
test('recovers after five playing seconds and preserves pause time',async({mount,page})=>{
    await page.clock.install();
    const probe=await mount('appleLyricRecovery');
    await page.clock.fastForward(2000);
    await probe.getByRole('button',{name:'Pause fixture'}).click();
    await page.clock.fastForward(20000);
    await expect(probe.getByTestId('recovery-requests')).toHaveText('0');
    await probe.getByRole('button',{name:'Resume fixture'}).click();
    await page.clock.fastForward(3000);
    await expect(probe.getByTestId('recovery-requests')).toHaveText('1');
    await probe.getByRole('button',{name:'Resolve fixture'}).click();
    await expect(probe.getByTestId('recovery-lyrics')).toContainText('Recovered one');
    await expect(probe.getByText('Timed lyrics cached for the next playback')).toBeVisible();
});
test('never applies the previous song response after switching',async({mount,page})=>{
    await page.clock.install();const probe=await mount('appleLyricRecovery');
    await page.clock.fastForward(5000);await expect(probe.getByTestId('recovery-requests')).toHaveText('1');
    await probe.getByRole('button',{name:'Switch fixture'}).click();
    await probe.getByRole('button',{name:'Resolve fixture'}).click();
    await expect(probe.getByTestId('recovery-lyrics')).toHaveText('empty');
});
test('does not replace a manual selection made during a download',async({mount,page})=>{
    await page.clock.install();const probe=await mount('appleLyricRecovery');
    await page.clock.fastForward(5000);await expect(probe.getByTestId('recovery-requests')).toHaveText('1');
    await probe.getByRole('button',{name:'Install manual lyrics'}).click();
    await expect(probe.getByTestId('recovery-lyrics')).toContainText('Manual one');
    await probe.getByRole('button',{name:'Resolve fixture'}).click();
    await expect(probe.getByTestId('recovery-lyrics')).toContainText('Manual one');
});
test('does not search during a long intro if the timeline is already present',async({mount,page})=>{
    await page.clock.install();const probe=await mount('appleLyricRecovery');
    await probe.getByRole('button',{name:'Install intro timeline'}).click();
    await page.clock.fastForward(30000);await expect(probe.getByTestId('recovery-requests')).toHaveText('0');
});

test('keeps the recovered timeline across a reload and reads it offline',async({mount,page,context})=>{
    let probe=await mount('appleLyricRecovery');
    await probe.getByRole('button',{name:'Cache fixture',exact:true}).click();
    await probe.getByRole('button',{name:'Read cached fixture',exact:true}).click();
    await expect(probe.getByTestId('recovery-lyrics')).toContainText('Recovered one');
    await page.reload();probe=await mount('appleLyricRecovery');
    await context.setOffline(true);
    await probe.getByRole('button',{name:'Read cached fixture',exact:true}).click();
    await expect(probe.getByTestId('recovery-lyrics')).toContainText('Recovered one');
    await expect(probe.getByTestId('recovery-requests')).toHaveText('0');
});
