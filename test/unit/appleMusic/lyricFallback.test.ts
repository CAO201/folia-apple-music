import { beforeEach, describe, it, expect, vi } from 'vitest';
import type { SongResult } from '../../../src/types';
import { getAppleMusicLyrics } from '../../../src/services/onlineMusic/appleMusicLyrics';
import { fetchAppleNeteaseLyrics, requestAppleLyricMetadata } from '../../../src/services/onlineMusic/appleNeteaseLyricTools';
import { buildSentenceTimeline } from '../../../src/utils/lyrics/appleTiming';

// test/unit/appleMusic/lyricFallback.test.ts
vi.mock('../../../src/services/onlineMusic/appleNeteaseLyricTools', () => ({ requestAppleLyricMetadata: vi.fn(), fetchAppleNeteaseLyrics: vi.fn() }));
const song: SongResult = { id: 'AB12345678901234', name: 'Test', artists: [{id: 1, name: 'Artist'}], album: {id:2,name:'Album'}, durationMs: 60000,
    sourceRef: {kind:'online',providerId:'applemusic',mediaId:'AB12345678901234'} };
const candidate = { ...song, id: 123 };
const apple = vi.fn();
const timed = () => ({ lyrics: buildSentenceTimeline('One\nTwo', [1, 5], 60), mainLrc: '[00:01.00]One\n[00:05.00]Two', yrcLrc: null, transLrc: null, isPureMusic:false });
beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('window', {electron:{appleMusicRequest:apple}});
    vi.mocked(requestAppleLyricMetadata).mockResolvedValue({songs:[candidate]});
    apple.mockResolvedValue({ok:true,data:{text:'[00:02.00]Apple One\n[00:06.00]Apple Two'}});
});
describe('NetEase-first sentence lyric fallback', () => {
    it('uses NetEase timing without even reading Apple text when a correct match exists', async () => {
        vi.mocked(fetchAppleNeteaseLyrics).mockResolvedValue(timed());
        const result = await getAppleMusicLyrics(song);
        expect(result.lyrics?.appleLyricsOrigin).toBe('netease');
        expect(result.lyrics?.lines[0].fullText).toBe('One');
        expect(apple).not.toHaveBeenCalled();
    });
    it('tries a second exact recording when the first NetEase candidate has no timed lyrics', async () => {
        vi.mocked(requestAppleLyricMetadata).mockResolvedValue({songs:[candidate,{...candidate,id:124}]});
        vi.mocked(fetchAppleNeteaseLyrics).mockResolvedValueOnce({...timed(),lyrics:null,mainLrc:null}).mockResolvedValueOnce(timed());
        expect((await getAppleMusicLyrics(song)).lyrics?.appleLyricsOrigin).toBe('netease');
        expect(fetchAppleNeteaseLyrics).toHaveBeenNthCalledWith(2,'124');
        expect(apple).not.toHaveBeenCalled();
    });
    it('uses timestamped Apple library lyrics only after NetEase cannot provide timing', async () => {
        vi.mocked(fetchAppleNeteaseLyrics).mockResolvedValue({...timed(),mainLrc:'One\nTwo'});
        const result = await getAppleMusicLyrics(song);
        expect(result.lyrics?.appleLyricsOrigin).toBe('apple-library');
        expect(apple).toHaveBeenCalledWith('lyrics',{mediaId:song.id});
    });
    it('does not let an incorrect instrumental flag hide readable timed Apple lyrics', async () => {
        vi.mocked(fetchAppleNeteaseLyrics).mockResolvedValue({...timed(),lyrics:null,isPureMusic:true});
        const result = await getAppleMusicLyrics(song);
        expect(result.lyrics?.appleLyricsOrigin).toBe('apple-library');
        expect(result.isPureMusic).toBe(false);
    });
    it('does not display or evenly time a plain Apple text fallback', async () => {
        vi.mocked(requestAppleLyricMetadata).mockRejectedValue(Error('offline'));
        apple.mockResolvedValue({ok:true,data:{text:'Plain\nLyrics'}});
        expect((await getAppleMusicLyrics(song)).lyrics).toBeNull();
    });
    it('keeps Apple fallback independent of NetEase network errors', async () => {
        vi.mocked(requestAppleLyricMetadata).mockRejectedValue(Error('offline'));
        expect((await getAppleMusicLyrics(song)).lyrics?.appleLyricsOrigin).toBe('apple-library');
    });
    it('treats inaccessible library text as missing, preserving the Apple audio identity', async () => {
        vi.mocked(requestAppleLyricMetadata).mockResolvedValue({songs:[]});
        apple.mockResolvedValue({ok:false,error:{message:'denied'}});
        expect((await getAppleMusicLyrics(song)).lyrics).toBeNull();
        expect(song.sourceRef).toMatchObject({providerId:'applemusic'});
    });
});
