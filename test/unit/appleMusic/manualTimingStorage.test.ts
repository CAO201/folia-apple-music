import { beforeEach, describe, it, expect, vi } from 'vitest';
import type { SongResult } from '../../../src/types';
import { buildSentenceTimeline } from '../../../src/utils/lyrics/appleTiming';
import { loadOnlineLyricsState, saveOnlineLyricsState, getOnlineLyricsStateCacheKey } from '../../../src/utils/onlineLyricsState';
import { saveAppleLyricCandidate } from '../../../src/services/appleMusicLyricMatching';
import { fetchAppleNeteaseLyrics } from '../../../src/services/onlineMusic/appleNeteaseLyricTools';
import { refreshAppleTimedLyrics } from '../../../src/services/appleMusicLyricRefresh';
import { omni } from '../../../src/services/onlineMusic/omni';
import { saveAppleTimedLyrics } from '../../../src/services/appleMusicLyricTiming';

// test/unit/appleMusic/manualTimingStorage.test.ts
vi.mock('../../../src/services/onlineMusic/omni', () => ({omni:{getLyrics:vi.fn()}}));
vi.mock('../../../src/services/onlineMusic/appleNeteaseLyricTools', () => ({fetchAppleNeteaseLyrics:vi.fn(),searchAppleNeteaseLyrics:vi.fn()}));
const data = vi.hoisted(() => new Map());
vi.mock('../../../src/services/db', () => ({
    getFromCacheWithMigration: async (key: string) => data.get(key) || null,
    saveToCache: async (key: string, value: unknown) => { data.set(key, value); },
}));
const song: SongResult = { id:'APPLE',name:'Song',artists:[],album:{id:1,name:'Album'},durationMs:60000,sourceRef:{kind:'online',providerId:'applemusic',mediaId:'APPLE'} };
beforeEach(() => data.clear());
describe('per-song manual timing', () => {
    it('keeps old manual binding keys while upgrading the automatic cache', () => {
        expect(getOnlineLyricsStateCacheKey(song)).toBe('lyric_netease_v1_online:applemusic:APPLE_state');
    });
    it('preserves an existing NetEase choice when adding imported sentence timing', async () => {
        const lyrics = buildSentenceTimeline('One\nTwo',[1,5],60);
        await saveOnlineLyricsState(song,{lyricsSource:'online',hasOnlineOverride:true,matchedSongId:123,onlineOverrideLyrics:lyrics});
        await saveAppleTimedLyrics(song,lyrics,'Manual');
        const state = await loadOnlineLyricsState(song);
        expect(state?.matchedSongId).toBe(123);
        expect(state?.lyricsSource).toBe('imported');
        expect(state?.importedLyrics?.appleLyricsOrigin).toBe('manual');
        expect((await loadOnlineLyricsState({...song,id:'OTHER',sourceRef:{kind:'online',providerId:'applemusic',mediaId:'OTHER'}}))).toBeNull();
    });
    it('preserves a manual timeline when the legacy best-match action is requested', async () => {
        const lyrics = buildSentenceTimeline('One\nTwo',[1,5],60);
        await saveAppleTimedLyrics(song,lyrics,'Manual');
        const result = await refreshAppleTimedLyrics(song);
        expect(result.lyrics?.appleLyricsOrigin).toBe('manual');
        expect(omni.getLyrics).not.toHaveBeenCalled();
    });
    it('rejects a manual NetEase candidate whose display times were not in the original text', async () => {
        vi.mocked(fetchAppleNeteaseLyrics).mockResolvedValue({lyrics:buildSentenceTimeline('One\nTwo',[1,5],60),mainLrc:'One\nTwo',yrcLrc:null,transLrc:null,isPureMusic:false});
        await expect(saveAppleLyricCandidate(song,{...song,id:123})).rejects.toThrow('时间轴');
        expect(await loadOnlineLyricsState(song)).toBeNull();
    });
    it('does not apply a historical untimed selection and does not delete its stored text', async () => {
        await saveOnlineLyricsState(song,{lyricsSource:'imported',importedLyricsName:'old.txt',importedLyrics:buildSentenceTimeline('One\nTwo',[1,5],60)});
        expect((await loadOnlineLyricsState(song))?.importedLyrics).toBeNull();
        expect(data.get(getOnlineLyricsStateCacheKey(song)).importedLyrics.lines).toHaveLength(2);
    });
});
