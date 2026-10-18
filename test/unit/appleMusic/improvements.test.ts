import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createRequire } from 'node:module';
import { neteaseLyricTitle, selectAppleNeteaseLyricSong } from '../../../src/services/onlineMusic/appleNeteaseLyricMatch';
import { buildSongThemePrompt } from '../../../src/utils/songThemePrompt';
import { shouldRequestSongThemeAutoGeneration } from '../../../src/utils/songThemeAutoGeneration';
import { searchAppleNeteaseLyrics } from '../../../src/services/onlineMusic/appleNeteaseLyricTools';
import type { SongResult } from '../../../src/types';

// test/unit/appleMusic/improvements.test.ts
const require = createRequire(import.meta.url);
const { createLyricMetadata } = require('../../../electron/apple-music/lyricMetadata.cjs');
const song: SongResult = { id: 'APPLE', name: "A Dandelion's Promise", artists: [{ id: 1, name: 'Jay Chou' }], durationMs: 240000,
    album: { id: 2, name: 'On the Run' }, sourceRef: { kind: 'online', providerId: 'applemusic', mediaId: 'APPLE' } };
beforeEach(() => vi.unstubAllGlobals());
describe('Apple-only improvements', () => {
    it('matches a translated title but still rejects live versions, covers, and wrong timing', () => {
        const candidate = { ...song, id: 123, name: '蒲公英的約定', artists: [{ id: 3, name: '周杰倫' }] };
        expect(neteaseLyricTitle(song)).toBe('蒲公英的约定');
        expect(selectAppleNeteaseLyricSong(song, [candidate])?.id).toBe(123);
        expect(selectAppleNeteaseLyricSong(song, [{ ...candidate, name: '蒲公英的约定 (Live)' }])).toBeNull();
        expect(selectAppleNeteaseLyricSong(song, [{ ...candidate, artists: [{ id: 4, name: 'Other' }] }])).toBeNull();
        expect(selectAppleNeteaseLyricSong(song, [{ ...candidate, durationMs: 250000 }])).toBeNull();
    });
    it('allows AI generation without lyrics and identifies the source honestly', () => {
        const input = buildSongThemePrompt(song, null);
        expect(input).toMatchObject({ metadataOnly: true, isPureMusic: false });
        expect(input.promptText).toContain('Jay Chou');
        expect(input.promptText).toContain('On the Run');
        expect(shouldRequestSongThemeAutoGeneration({ enabled: true, currentSong: song, lyrics: null,
            isLyricsLoading: false, hasAttempted: false, hasCachedTheme: false })).toBe(true);
        expect(buildSongThemePrompt(null, null).promptText).toBe('');
    });
    it('keeps lyric and instrumental generation sources separate', () => {
        const lyrics = { lines: [{ fullText: 'actual lyrics' }] } as any;
        expect(buildSongThemePrompt(song, lyrics)).toMatchObject({ metadataOnly: false, promptText: 'actual lyrics' });
        expect(buildSongThemePrompt({ ...song, isPureMusic: true }, null)).toMatchObject({ isPureMusic: true, metadataOnly: false, promptText: song.name });
    });
    it('accepts a NetEase song link as metadata detail, never an audio request', async () => {
        const bridge = vi.fn().mockResolvedValue({ ok: true, data: { songs: [] } });
        vi.stubGlobal('window', { electron: { neteaseLyricsRequest: bridge } });
        await searchAppleNeteaseLyrics('https://music.163.com/#/song?id=12345');
        expect(bridge).toHaveBeenCalledWith('detail', { id: '12345' });
        await searchAppleNeteaseLyrics('中文歌名 歌手');
        expect(bridge).toHaveBeenLastCalledWith('search', { keywords: '中文歌名 歌手' });
        await expect(searchAppleNeteaseLyrics('https://music.163.com/#/playlist?id=1')).rejects.toThrow();
    });
    it('only accepts same-ID localized metadata with matching duration and caches it', async () => {
        const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [
            { kind: 'song', trackId: 123, trackName: '中文名', artistName: '歌手', trackTimeMillis: 240000 },
            { kind: 'song', trackId: 999, trackName: '错误歌曲', trackTimeMillis: 240000 },
        ] }) });
        const lookup = createLyricMetadata(fetcher);
        const params = { title: song.name, artist: 'Jay Chou', durationMs: 240000, catalogId: '123' };
        expect((await lookup(params)).songs.every((item: any) => item.id === 123)).toBe(true);
        await lookup(params);
        expect(fetcher).toHaveBeenCalledTimes(3);
        expect(fetcher.mock.calls.every(([url]) => url.startsWith('https://itunes.apple.com/lookup?'))).toBe(true);
        expect((await lookup({ ...params, durationMs: 255000 })).songs).toEqual([]);
    });
});
