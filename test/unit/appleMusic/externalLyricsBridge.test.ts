import { createRequire } from 'node:module';
import { expect, it, vi } from 'vitest';

// test/unit/appleMusic/externalLyricsBridge.test.ts
const require = createRequire(import.meta.url);
const { createExternalLyrics } = require('../../../electron/apple-music/externalLyrics.cjs');
const response = (data: unknown) => ({ok:true,text:async () => JSON.stringify(data)});
it('normalizes observed QQ public search fields and requests only lyrics', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(response({code:0,data:{song:{list:[{songmid:'0039MnYb0qxYhV',songname:'晴天',singer:[{name:'周杰伦'}],albumname:'叶惠美',interval:269}]}}}))
        .mockResolvedValueOnce(response({code:0,retcode:0,lyric:'[00:01.00]One\n[00:05.00]Two'}));
    const bridge = createExternalLyrics(fetcher);
    const data = await bridge.request('external-search',{provider:'qq',keywords:'晴天 周杰伦'});
    expect(data.songs[0]).toMatchObject({id:'0039MnYb0qxYhV',durationMs:269000});
    expect((await bridge.request('external-lyrics',{provider:'qq',id:data.songs[0].id})).text).toContain('[00:01.00]');
    expect(fetcher.mock.calls.every(([url]) => url.startsWith('https://c.y.qq.com/'))).toBe(true);
});
it('handles KuGou song and lyric-candidate durations separately', async () => {
    const hash = 'a'.repeat(32);
    const fetcher = vi.fn().mockResolvedValueOnce(response({status:1,errcode:0,data:{info:[{hash,songname:'Song',singername:'Singer',album_name:'Album',duration:269}]}}))
        .mockResolvedValueOnce(response({status:200,candidates:[{id:'123',accesskey:'abc',song:'Song',singer:'Singer',duration:269792},{id:'124',accesskey:'def',duration:999999}]}))
        .mockResolvedValueOnce(response({status:200,content:'fixture',contenttype:0}));
    const bridge = createExternalLyrics(fetcher);
    const data = await bridge.request('external-search',{provider:'kugou',keywords:'Song Singer'});
    expect(data.songs[0].durationMs).toBe(269000);
    const lyrics = await bridge.request('external-lyrics',{provider:'kugou',id:hash,keywords:'Song Singer',durationMs:269000});
    expect(lyrics.downloads).toHaveLength(1); expect(lyrics.downloads[0].song.durationMs).toBe(269792);
    expect(fetcher).toHaveBeenCalledTimes(3);
});
it('never treats LRCLIB plain text as timed lyrics', async () => {
    const bridge = createExternalLyrics(vi.fn().mockResolvedValue(response({plainLyrics:'Untimed',syncedLyrics:null})));
    expect((await bridge.request('external-lyrics',{provider:'lrclib',id:'123'})).text).toBe('');
});
it('rejects arbitrary providers, URLs, IDs and playback operations', async () => {
    const fetcher = vi.fn(); const bridge = createExternalLyrics(fetcher);
    for (const [operation,params] of [['play',{provider:'qq'}],['external-search',{provider:'evil',keywords:'Song'}],['external-lyrics',{provider:'qq',id:'https://example.com'}],['external-lyrics',{provider:'kugou',id:'bad'}]]) {
        await expect(bridge.request(operation,params)).rejects.toThrow();
    }
    expect(fetcher).not.toHaveBeenCalled();
});
it('does not cache a failed upstream response as an empty success', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(response({code:2001})).mockResolvedValue(response({code:0,data:{song:{list:[]}}}));
    const bridge = createExternalLyrics(fetcher); const params = {provider:'qq',keywords:'Song'};
    await expect(bridge.request('external-search',params)).rejects.toThrow();
    expect(await bridge.request('external-search',params)).toEqual({songs:[]});
    expect(fetcher).toHaveBeenCalledTimes(2);
});
