import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../../src/utils/lyrics/neteaseProcessing', () => ({ processNeteaseLyrics: vi.fn() }));
import { processNeteaseLyrics } from '../../../src/utils/lyrics/neteaseProcessing';
import { getAppleMusicLyrics } from '../../../src/services/onlineMusic/appleMusicLyrics';
import { selectAppleNeteaseLyricSong } from '../../../src/services/onlineMusic/appleNeteaseLyricMatch';
import { getSongResourceCacheKey } from '../../../src/services/onlineMusic/resourceKeys';
import type { SongResult } from '../../../src/types';

// test/unit/appleMusic/neteaseLyrics.test.ts
const target: SongResult = { id: 'APPLE', name: '匆匆那年', artists: [{ id: 'faye', name: 'Faye Wong' }], album: { id: 'album', name: '匆匆那年' },
    durationMs: 240000, sourceRef: { kind: 'online', providerId: 'applemusic', mediaId: 'APPLE' } };
const matched = { ...target, id: 123, artists: [{ id: 456, name: '王菲' }], sourceRef: undefined };
describe('NetEase lyrics with Apple Music audio identity', () => {
    beforeEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); });
    it('matches localized artist aliases and rejects a cover, live version or different duration', () => {
        expect(selectAppleNeteaseLyricSong(target, [matched])?.id).toBe(123);
        expect(selectAppleNeteaseLyricSong(target, [{ ...matched, artists: [{ id: 1, name: '翻唱者' }] }])).toBeNull();
        expect(selectAppleNeteaseLyricSong(target, [{ ...matched, name: '匆匆那年 (Live)' }])).toBeNull();
        expect(selectAppleNeteaseLyricSong(target, [{ ...matched, durationMs: 250000 }])).toBeNull();
    });
    it('requests only metadata search and lyrics, preserving the Apple playback source', async () => {
        const bridge = vi.fn().mockResolvedValueOnce({ ok: true, data: { songs: [matched] } })
            .mockResolvedValueOnce({ ok: true, data: { code: 200, yrc: { lyric: 'yrc payload' } } });
        vi.stubGlobal('window', { electron: { neteaseLyricsRequest: bridge } });
        vi.mocked(processNeteaseLyrics).mockResolvedValue({ lyrics: { lines: [{ fullText: 'Test', startTime: 0, endTime: 2, words: [{text:'Test',startTime:0,endTime:2}] }], isWordByWord: true },
            mainLrc: null, yrcLrc: '[0,2000](0,2000,0)Test', transLrc: 'translation', isPureMusic: false });
        const result = await getAppleMusicLyrics(target);
        expect(bridge.mock.calls.map(call => call[0])).toEqual(['search', 'lyrics']);
        expect(bridge.mock.calls[1][1]).toEqual({ id: '123' });
        expect(result.wordByWordText).toBe('[0,2000](0,2000,0)Test');
        expect(result.translationText).toBe('translation');
        expect(target.sourceRef).toMatchObject({ providerId: 'applemusic', mediaId: 'APPLE' });
    });
    it('does not fetch lyrics for a same-name recording by a different artist', async () => {
        const bridge = vi.fn().mockImplementation(operation => Promise.resolve({ ok: true, data: { songs: operation === 'localized' ? [] : [{ ...matched, artists: [{ id: 1, name: 'Other' }] }] } }));
        vi.stubGlobal('window', { electron: { neteaseLyricsRequest: bridge } });
        expect((await getAppleMusicLyrics(target)).lyrics).toBeNull();
        expect(bridge.mock.calls.every(call => call[0] === 'search')).toBe(true);
    });
    it('separates the new automatic lyric cache from previous community lyrics', () => {
        expect(getSongResourceCacheKey('lyric', target)).toBe('lyric_sentence_v2_online:applemusic:APPLE');
        expect(getSongResourceCacheKey('audio', target)).toBe('audio_online:applemusic:APPLE');
    });
});
