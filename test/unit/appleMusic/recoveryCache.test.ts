import { beforeEach, expect, it, vi } from 'vitest';
import { readRecoveredAppleLyrics, cacheRecoveredAppleLyrics } from '../../../src/services/onlineMusic/appleLyricRecoveryCache';
import { getAppleLyricIdentities } from '../../../src/services/onlineMusic/appleLyricIdentities';
import { requestAppleLyricMetadata } from '../../../src/services/onlineMusic/appleNeteaseLyricTools';
import { buildSentenceTimeline } from '../../../src/utils/lyrics/appleTiming';
import type { SongResult } from '../../../src/types';

// test/unit/appleMusic/recoveryCache.test.ts
const data = vi.hoisted(() => new Map());
vi.mock('../../../src/services/db',()=>({getFromCache:async(key:string)=>data.get(key),saveToCache:async(key:string,value:unknown)=>{data.set(key,structuredClone(value));}}));
vi.mock('../../../src/services/onlineMusic/appleNeteaseLyricTools',()=>({requestAppleLyricMetadata:vi.fn()}));
const song:SongResult = {id:'APPLE-LOCAL',name:'Sunny Day',artists:[{id:1,name:'Jay Chou'}],album:{id:1,name:'Ye Hui Mei'},durationMs:269000,
    sourceRef:{kind:'online',providerId:'applemusic',mediaId:'catalog:TR:123',providerData:{url:'https://music.apple.com/tr/album/test/123?i=123'}}};
beforeEach(()=>{data.clear();vi.resetAllMocks();});
it('persists complete lyrics and provenance for offline replay, isolated by song ID',async()=>{
    const lyrics={...buildSentenceTimeline('One\nTwo',[1,5],269),appleLyricsOrigin:'qq' as const,appleLyricsMatch:{sourceId:'QQ123',title:'晴天',artist:'周杰伦',fetchedAt:123}};
    await cacheRecoveredAppleLyrics(song,lyrics);
    expect(await readRecoveredAppleLyrics(song)).toEqual(lyrics);
    expect(await readRecoveredAppleLyrics({...song,sourceRef:{kind:'online',providerId:'applemusic',mediaId:'OTHER'}})).toBeNull();
    expect(await readRecoveredAppleLyrics({...song,durationMs:280000})).toBeNull();
});
it('does not save malformed timing',async()=>{
    await cacheRecoveredAppleLyrics(song,{lines:[],isWordByWord:false});
    expect(await readRecoveredAppleLyrics(song)).toBeNull();expect(data.size).toBe(0);
});
it('resolves trusted Chinese metadata first, preserving TR context and numeric catalog ID',async()=>{
    vi.mocked(requestAppleLyricMetadata).mockResolvedValue({songs:[{...song,id:123,name:'晴天',artists:[{id:1,name:'周杰伦'}]}]});
    const identities = await getAppleLyricIdentities(song);
    expect(identities[0].name).toBe('晴天');
    expect(requestAppleLyricMetadata).toHaveBeenCalledWith('localized',expect.objectContaining({catalogId:'123',region:'tr'}));
    vi.mocked(requestAppleLyricMetadata).mockRejectedValue(Error('offline'));
    expect((await getAppleLyricIdentities(song))[0].name).toBe('晴天');
    expect(requestAppleLyricMetadata).toHaveBeenCalledTimes(1);
});
it('retains an explicit title/artist alias if Apple localized metadata is unavailable',async()=>{
    vi.mocked(requestAppleLyricMetadata).mockRejectedValue(Error('offline'));
    expect((await getAppleLyricIdentities(song))[0]).toMatchObject({name:'晴天',artists:[{name:'周杰伦'}]});
    expect(song.name).toBe('Sunny Day');
});
