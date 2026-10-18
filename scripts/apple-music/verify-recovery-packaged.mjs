import { _electron } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { extractFile } from '@electron/asar';

// scripts/apple-music/verify-recovery-packaged.mjs
// Isolated desktop IPC smoke test. Public metadata/lyrics only; never sends playback commands.
const executable = process.env.FOLIA_TEST_APP || path.resolve('release/apple-music/mac-arm64/Folia Apple Music.app/Contents/MacOS/Folia Apple Music');
const profile = path.resolve(`.apple-package/recovery-smoke-${Date.now()}/userdata`);
await fs.mkdir(path.dirname(profile),{recursive:true});
const app = await _electron.launch({executablePath:executable,args:[`--user-data-dir=${profile}`],timeout:60000});
try {
    if (await app.evaluate(({app})=>app.getPath('userData'))!==profile) throw Error('Refusing non-isolated profile');
    const page = await app.firstWindow();
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.waitForFunction(()=>typeof window.electron?.neteaseLyricsRequest === 'function',null,{timeout:30000});
    const sources=await page.evaluate(async()=>{
        const results=[];
        for(const [provider,keywords,title,artist,duration] of [
            ['qq','晴天 周杰伦','晴天','周杰伦',269000],
            ['kugou','晴天 周杰伦','晴天','周杰伦',269000],
            ['lrclib','Yellow Coldplay','Yellow','Coldplay',269000],
        ]){
            const search=await window.electron.neteaseLyricsRequest('external-search',{provider,keywords});
            if(!search.ok) {results.push({provider,ok:false,stage:'search',error:search.error});continue;}
            const song=search.data.songs.find(item=>item.name===title && item.artists.some(a=>a.name===artist) && Math.abs(item.durationMs-duration)<=4000);
            if(!song){results.push({provider,ok:false,stage:'match'});continue;}
            const lyrics=await window.electron.neteaseLyricsRequest('external-lyrics',{provider,id:String(song.id),durationMs:song.durationMs,keywords:`${artist} - ${title}`});
            const hasContent=provider==='kugou' ? Boolean(lyrics.data?.downloads?.length) : /\[\d+:\d+/.test(lyrics.data?.text||'');
            results.push({provider,ok:lyrics.ok&&hasContent,stage:'lyrics',candidateCount:search.data.songs.length});
        }
        const netease=await window.electron.neteaseLyricsRequest('search',{keywords:'十年 陈奕迅'});
        const song=netease.data?.songs?.find(item=>item.name==='十年'&&item.artists.some(a=>a.name==='陈奕迅')&&Math.abs(item.durationMs-205000)<=4000);
        const lyrics=song && await window.electron.neteaseLyricsRequest('lyrics',{id:String(song.id)});
        results.push({provider:'netease',ok:Boolean(lyrics?.ok && (lyrics.data?.yrc?.lyric||lyrics.data?.lrc?.lyric)),stage:'lyrics'});
        return results;
    });
    const version=JSON.parse(extractFile(path.resolve(path.dirname(executable),'../Resources/app.asar'),'package.json').toString()).version;
    const report={version,isolatedProfile:true,playbackCommandsSent:false,sourceChecks:sources,pageErrors:errors};
    await fs.writeFile('release-materials/RECOVERY_CHECKS.json',JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify(report));
    if(errors.length||sources.some(source=>!source.ok)) process.exitCode=1;
} finally {await app.close();}
