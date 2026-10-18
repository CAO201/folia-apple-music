import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createServer } from 'vite';

// scripts/apple-music/verify-external-lyrics.mjs
// Public metadata/lyrics only; never controls playback or reads a user's library.
const require = createRequire(import.meta.url);
const { createExternalLyrics } = require('../../electron/apple-music/externalLyrics.cjs');
const { createNeteaseLyricsBridge } = require('../../electron/apple-music/neteaseLyrics.cjs');
const server = await createServer({server:{middlewareMode:true}, appType:'custom'});
try {
    const { parseSentenceLyrics, hasSentenceTimeline } = await server.ssrLoadModule('/src/utils/lyrics/appleTiming.ts');
    const { decodeKugouDownloadedLyric } = await server.ssrLoadModule('/src/utils/lyrics/providers/kugouLyricProvider.ts');
    const { extractNeteaseLyricPayload } = await server.ssrLoadModule('/src/utils/lyrics/neteaseProcessing.ts');
    const bridge = createExternalLyrics(fetch);
    const checks = [];
    for (const [provider,query,title,artist,duration] of [
        ['qq','晴天 周杰伦','晴天','周杰伦',269000],
        ['kugou','晴天 周杰伦','晴天','周杰伦',269000],
        ['lrclib','Yellow Coldplay','Yellow','Coldplay',269000],
    ]) {
        try {
            const result = await bridge.request('external-search',{provider,keywords:query});
            const song = result.songs.find(item => item.name === title && item.artists.some(a => a.name === artist) && Math.abs(item.durationMs - duration) <= 4000);
            if (!song) throw Error('No matching song');
            const resultLyrics = await bridge.request('external-lyrics',{provider,id:String(song.id),keywords:`${artist} - ${title}`,durationMs:song.durationMs});
            const samples = [];
            if (provider === 'kugou') for (const item of resultLyrics.downloads || []) {
                const decoded = await decodeKugouDownloadedLyric(Buffer.from(item.content,'base64'),item.contenttype);
                samples.push(parseSentenceLyrics(decoded.lyricText,song.durationMs,decoded.format));
            }
            else samples.push(parseSentenceLyrics(resultLyrics.text,song.durationMs,'lrc'));
            const lyrics = samples.find(data => hasSentenceTimeline(data,song.durationMs));
            if (!lyrics) throw Error('No valid sentence timeline');
            checks.push({provider,ok:true,candidateCount:result.songs.length,timedLines:lyrics.lines.length,wordByWord:lyrics.isWordByWord});
        } catch(error) {checks.push({provider,ok:false,error:error.message});}
    }
    try {
        const netease = createNeteaseLyricsBridge({fetcher:fetch});
        const result = await netease.request('search',{keywords:'十年 陈奕迅'});
        const song = result.songs.find(item => item.name === '十年' && item.artists.some(a=>a.name==='陈奕迅') && Math.abs(item.durationMs-205000)<=4000);
        if (!song) throw Error('No matching NetEase song');
        const resultLyrics = extractNeteaseLyricPayload(await netease.request('lyrics',{id:String(song.id)}));
        const parsed = parseSentenceLyrics(resultLyrics.yrcLrc || resultLyrics.mainLrc || '',song.durationMs,resultLyrics.yrcLrc ? 'yrc' : 'lrc');
        if (!hasSentenceTimeline(parsed,song.durationMs)) throw Error('No NetEase sentence timeline');
        checks.push({provider:'netease',ok:true,timedLines:parsed.lines.length,wordByWord:Boolean(resultLyrics.yrcLrc)});
    } catch(error) {checks.push({provider:'netease',ok:false,error:error.message});}
    const report = {at:new Date().toISOString(),playbackCommandsSent:false,checks};
    await fs.writeFile('test-results/external-lyrics-live.json',JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify(report));
    if (checks.some(check=>!check.ok)) process.exitCode=1;
} finally {await server.close();}
