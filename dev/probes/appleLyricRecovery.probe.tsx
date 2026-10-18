import { cacheRecoveredAppleLyrics, readRecoveredAppleLyrics } from '../../src/services/onlineMusic/appleLyricRecoveryCache';
import React, { useEffect, useState } from 'react';
import type { ProbeDefinition } from './definition';
import type { SongResult } from '../../src/types';
import { PlayerState } from '../../src/types';
import { omni } from '../../src/services/onlineMusic/omni';
import { useAppleLyricRecovery } from '../../src/hooks/useAppleLyricRecovery';
import { usePlaybackStore } from '../../src/stores/usePlaybackStore';
import { buildSentenceTimeline } from '../../src/utils/lyrics/appleTiming';
import { saveAppleTimedLyrics } from '../../src/services/appleMusicLyricTiming';
import AppleLyricRecoveryStatus from '../../src/components/panelTab/AppleLyricRecoveryStatus';

// dev/probes/appleLyricRecovery.probe.tsx
const song: SongResult = {id:'RECOVERY-A',name:'Recovery fixture',artists:[],album:{id:1,name:'Fixture'},durationMs:60000,
    sourceRef:{kind:'online',providerId:'applemusic',mediaId:'RECOVERY-A'}};
const timed = () => ({...buildSentenceTimeline('Recovered one\nRecovered two',[10,20],60),appleLyricsOrigin:'qq' as const});
function Probe() {
    const [requests,setRequests] = useState(0);
    const [resolve,setResolve] = useState<(() => void) | null>(null);
    const lyrics = usePlaybackStore(state=>state.lyrics);
    const current = usePlaybackStore(state=>state.currentSong);
    useAppleLyricRecovery(value=>usePlaybackStore.getState().setLyricsState(value));
    useEffect(()=>{
        const original = omni.recoverLyrics;
        omni.recoverLyrics = async () => {
            setRequests(count=>count+1);
            return new Promise(done=>setResolve(() => () => done({lyrics:timed(),isPureMusic:false})));
        };
        usePlaybackStore.setState({currentSong:song,lyrics:null,playerState:PlayerState.PLAYING});
        return ()=>{omni.recoverLyrics=original;};
    },[]);
    return <main className="max-w-xl space-y-3 bg-zinc-900 p-6 text-white">
        <button onClick={()=>void cacheRecoveredAppleLyrics(song,timed())}>Cache fixture</button>
        <button onClick={()=>void readRecoveredAppleLyrics(song).then(value=>usePlaybackStore.getState().setLyricsState(value))}>Read cached fixture</button>
        <button onClick={()=>usePlaybackStore.getState().setPlayerState(PlayerState.PAUSED)}>Pause fixture</button>
        <button onClick={()=>usePlaybackStore.getState().setPlayerState(PlayerState.PLAYING)}>Resume fixture</button>
        <button disabled={!resolve} onClick={()=>resolve?.()}>Resolve fixture</button>
        <button onClick={()=>usePlaybackStore.setState({currentSong:{...song,id:'RECOVERY-B',sourceRef:{kind:'online',providerId:'applemusic',mediaId:'RECOVERY-B'}},lyrics:null,playerState:PlayerState.PAUSED})}>Switch fixture</button>
        <button onClick={()=>usePlaybackStore.getState().setLyricsState(buildSentenceTimeline('Intro lyric\nNext',[20,30],60))}>Install intro timeline</button>
        <button onClick={async ()=>{const manual=buildSentenceTimeline('Manual one\nManual two',[1,5],60);await saveAppleTimedLyrics(song,manual,'Manual');usePlaybackStore.getState().setLyricsState({...manual,appleLyricsOrigin:'manual'});}}>Install manual lyrics</button>
        {current && <AppleLyricRecoveryStatus key={String(current.id)} song={current} onSaved={()=>{}} />}
        <p data-testid="recovery-requests">{requests}</p>
        <p data-testid="recovery-lyrics">{lyrics?.lines.map(line=>line.fullText).join('|') || 'empty'}</p>
    </main>;
}
export default {id:'appleLyricRecovery',title:'Automatic lyric recovery',description:'Five-second timer, cancellation and manual protection',Component:Probe} satisfies ProbeDefinition;
