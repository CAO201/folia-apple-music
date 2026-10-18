import { expect, test } from './fixtures';

// test/component/appleLyricTiming.spec.ts
test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('folia_app_language', 'en'));
});

// All native clocks are fixtures. These tests never play, pause or seek the user's Music app.
test('reads Apple text, marks sentences, undoes and saves true line timing', async ({ mount, page }) => {
    const editor = await mount('appleLyricTiming');
    await editor.getByRole('button', {name:'Read Apple song-info lyrics'}).click();
    await expect(editor.getByRole('textbox', {name:'Lyric text'})).toHaveValue('First line\nSecond line');
    await expect(editor.getByRole('button', {name:'Save and use'})).toBeDisabled();
    const tap = editor.getByRole('button', {name:/Mark next sentence/});
    await tap.click(); await expect(editor.getByRole('spinbutton', {name:'Sentence 1 start in seconds'})).toHaveValue('1');
    await tap.focus(); await page.keyboard.press('Space');
    await expect(editor.getByRole('spinbutton', {name:'Sentence 2 start in seconds'})).toHaveValue('5');
    await editor.getByRole('button', {name:'Undo last mark'}).click();
    await tap.click();
    await editor.getByRole('button', {name:'Save and use'}).focus();
    await page.keyboard.press('Space');
    await expect(editor.getByTestId('timing-saved')).toContainText('"startTime":9');
    await expect(editor.getByTestId('timing-saved')).toContainText('"isWordByWord":false');
    await page.screenshot({path:'test-results/apple-timing-editor.png'});
});
test('never marks the previous song after switching tracks and retains its draft', async ({ mount }) => {
    const editor = await mount('appleLyricTiming');
    await editor.getByRole('button', {name:'Read Apple song-info lyrics'}).click();
    await editor.getByRole('button', {name:/Mark next sentence/}).click();
    await editor.getByRole('button', {name:'Toggle editor'}).click();
    await editor.getByRole('button', {name:'Toggle editor'}).click();
    await expect(editor.getByRole('spinbutton', {name:'Sentence 1 start in seconds'})).toHaveValue('1');
    await editor.getByRole('button', {name:'Switch fixture song'}).click();
    await editor.getByRole('button', {name:/Mark next sentence/}).click();
    await expect(editor.getByTestId('apple-lyric-timing').getByRole('status')).toContainText('Play this song in Folia first');
    await expect(editor.getByRole('button', {name:'Save and use'})).toBeDisabled();
});
test('rejects untimed text but accepts explicit pasted timestamps', async ({ mount }) => {
    const editor = await mount('appleLyricTiming');
    const input = editor.getByRole('textbox', {name:'Lyric text'});
    await expect(input).toBeEnabled();
    await input.fill('First\nSecond');
    await editor.getByRole('button', {name:'Use timestamps from text'}).click();
    await expect(editor.getByTestId('apple-lyric-timing').getByRole('status')).toContainText('No reliable sentence timeline');
    await expect(editor.getByTestId('timing-saved')).toHaveText('');
    await input.fill('[00:01.00]First\n[00:05.00]Second');
    await editor.getByRole('button', {name:'Use timestamps from text'}).click();
    await expect(editor.getByTestId('timing-saved')).toContainText('"startTime":5');
});
