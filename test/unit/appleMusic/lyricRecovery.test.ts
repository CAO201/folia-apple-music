import { beforeEach, expect, it, vi } from 'vitest';
import { recoverAppleLyrics } from '../../../src/services/onlineMusic/appleLyricRecovery';
import { getAppleNeteaseTimedLyrics } from '../../../src/services/onlineMusic/appleMusicLyrics';
import { searchExternalLyrics, fetchExternalLyrics } from '../../../src/services/onlineMusic/appleExternalLyricTools';
import { readRecoveredAppleLyrics, cacheRecoveredAppleLyrics } from '../../../src/services/onlineMusic/appleLyricRecoveryCache';
import { buildSentenceTimeline } from '../../../src/utils/lyrics/appleTiming';
import type { SongResult } from '../../../src/types';

// test/unit/appleMusic/lyricRecovery.test.ts
const db = vi.hoisted(() => new Map());
vi.mock('../../../src/services/db', () => ({ getFromCache: async (key: string) => db.get(key), saveToCache: async (key: string, value: unknown) => { db.set(key, value); } }));
vi.mock('../../../src/services/onlineMusic/appleMusicLyrics', () => ({ getAppleNeteaseTimedLyrics: vi.fn() }));
vi.mock('../../../src/services/onlineMusic/appleLyricIdentities', () => ({ getAppleLyricIdentities: async (song: SongResult) => [{ ...song, name: '晴天', artists: [{ id: 1, name: '周杰伦' }], album: { id: 1, name: '叶惠美' } }, song] }));
vi.mock('../../../src/services/onlineMusic/appleExternalLyricTools', () => ({ searchExternalLyrics: vi.fn(), fetchExternalLyrics: vi.fn() }));
vi.mock('../../../src/services/onlineMusic/appleLyricRecoveryCache', () => ({ readRecoveredAppleLyrics: vi.fn(), cacheRecoveredAppleLyrics: vi.fn() }));
const song: SongResult = { id:'Apple',name:'Sunny Day',artists:[{id:1,name:'Jay Chou'}],album:{id:1,name:'Ye Hui Mei'},durationMs:269000,sourceRef:{kind:'online',providerId:'applemusic',mediaId:'Apple'} };
const match: SongResult = {...song,id:'QQ',name:'晴天',artists:[{id:1,name:'周杰伦'}],album:{id:1,name:'叶惠美'}};
const timed = () => ({lyrics:buildSentenceTimeline('One\nTwo',[1,5],269),isPureMusic:false});
beforeEach(() => {
    vi.resetAllMocks(); db.clear();
    vi.mocked(readRecoveredAppleLyrics).mockResolvedValue(null);
    vi.mocked(getAppleNeteaseTimedLyrics).mockResolvedValue({lyrics:null,isPureMusic:false});
    vi.mocked(searchExternalLyrics).mockResolvedValue([match]);
    vi.mocked(fetchExternalLyrics).mockImplementation(async source => ({...timed(),lyrics:{...timed().lyrics,appleLyricsOrigin:source}}));
});
it('keeps NetEase first and does not query other sources for valid timed lyrics', async () => {
    vi.mocked(getAppleNeteaseTimedLyrics).mockResolvedValue(timed());
    expect((await recoverAppleLyrics(song)).lyrics).toBeTruthy();
    expect(searchExternalLyrics).not.toHaveBeenCalled();
});
it('searches localized Chinese first and leaves the Apple identity unchanged', async () => {
    const result = await recoverAppleLyrics(song);
    expect(searchExternalLyrics).toHaveBeenCalledWith('qq','晴天 周杰伦',expect.any(AbortSignal));
    expect(result.lyrics?.appleLyricsOrigin).toBe('qq');
    expect(song.name).toBe('Sunny Day'); expect(song.sourceRef).toMatchObject({providerId:'applemusic'});
    expect(cacheRecoveredAppleLyrics).toHaveBeenCalledWith(song, result.lyrics);
});
it.each(['qq','kugou','lrclib'] as const)('can recover from %s when the other sources fail', async source => {
    vi.mocked(searchExternalLyrics).mockImplementation(async provider => { if (provider !== source) throw Error('offline'); return [match]; });
    expect((await recoverAppleLyrics(song)).lyrics?.appleLyricsOrigin).toBe(source);
});
it('rejects a live version, a different artist, and recordings with a wrong duration', async () => {
    vi.mocked(searchExternalLyrics).mockResolvedValue([{...match,name:'晴天 (Live)'},{...match,artists:[{id:2,name:'Cover Singer'}]},{...match,durationMs:280000}]);
    expect((await recoverAppleLyrics(song)).lyrics).toBeNull();
    expect(fetchExternalLyrics).not.toHaveBeenCalled();
});
it('requires confirmation for weaker metadata and duration matches', async () => {
    vi.mocked(searchExternalLyrics).mockResolvedValue([{...match,durationMs:272500,album:{id:5,name:'Different Album'}}]);
    const result = await recoverAppleLyrics(song);
    expect(result.lyrics).toBeNull(); expect(result.candidates).toHaveLength(3);
    expect(result.candidates?.every(item => !item.automatic)).toBe(true);
    expect(fetchExternalLyrics).not.toHaveBeenCalled();
});
it('does not cache plain or invalid lyric data', async () => {
    vi.mocked(fetchExternalLyrics).mockResolvedValue({lyrics:null,isPureMusic:false});
    expect((await recoverAppleLyrics(song)).lyrics).toBeNull();
    expect(cacheRecoveredAppleLyrics).not.toHaveBeenCalled();
});
it('loads a prior successful cache without contacting any source', async () => {
    vi.mocked(readRecoveredAppleLyrics).mockResolvedValue(timed().lyrics);
    expect((await recoverAppleLyrics(song)).lyrics).toBeTruthy();
    expect(getAppleNeteaseTimedLyrics).not.toHaveBeenCalled();
    expect(searchExternalLyrics).not.toHaveBeenCalled();
});
it('applies a failure cooldown but allows an explicit retry', async () => {
    vi.mocked(searchExternalLyrics).mockResolvedValue([]);
    await recoverAppleLyrics(song); const calls = vi.mocked(searchExternalLyrics).mock.calls.length;
    await recoverAppleLyrics(song); expect(searchExternalLyrics).toHaveBeenCalledTimes(calls);
    await recoverAppleLyrics(song,{force:true}); expect(vi.mocked(searchExternalLyrics).mock.calls.length).toBeGreaterThan(calls);
});
it('does not persist a late response after switching songs', async () => {
    const abort = new AbortController();
    vi.mocked(fetchExternalLyrics).mockImplementation(async () => { abort.abort(); return timed(); });
    await expect(recoverAppleLyrics(song,{signal:abort.signal})).rejects.toThrow();
    expect(cacheRecoveredAppleLyrics).not.toHaveBeenCalled();
});

it('keeps a successful source even if another source never responds', async () => {
    vi.useFakeTimers();
    try {
        vi.mocked(searchExternalLyrics).mockImplementation(async source => source === 'qq' ? [match] : new Promise(() => {}));
        const job = recoverAppleLyrics(song);
        await vi.advanceTimersByTimeAsync(20001);
        expect((await job).lyrics?.appleLyricsOrigin).toBe('qq');
    } finally { vi.useRealTimers(); }
});

it('queries LRCLIB using the original English name and recognizes the same known Chinese song', async () => {
    vi.mocked(searchExternalLyrics).mockImplementation(async source => source === 'lrclib' ? [{...song,id:'123'}] : []);
    const result=await recoverAppleLyrics(song);
    expect(searchExternalLyrics).toHaveBeenCalledWith('lrclib','Sunny Day Jay Chou',expect.any(AbortSignal));
    expect(result.lyrics?.appleLyricsOrigin).toBe('lrclib');
});

it('does not identify a recording from a title and duration when its artist is missing', async () => {
    const missingArtist={...song,name:'晴天',artists:[]};
    // The metadata fixture adds a trusted localization, so test the pure matcher separately below.
    const {selectAppleNeteaseLyricSong}=await import('../../../src/services/onlineMusic/appleNeteaseLyricMatch');
    expect(selectAppleNeteaseLyricSong(missingArtist,[match])).toBeNull();
    expect(selectAppleNeteaseLyricSong(song,[{...match,artists:[]}])).toBeNull();
});
