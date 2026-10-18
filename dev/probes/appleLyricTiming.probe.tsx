import React, { useEffect, useState } from 'react';
import type { ProbeDefinition } from './definition';
import type { SongResult } from '../../src/types';
import AppleLyricTimingEditor from '../../src/components/panelTab/AppleLyricTimingEditor';
import { omni } from '../../src/services/onlineMusic/omni';
import { usePlaybackStore } from '../../src/stores/usePlaybackStore';
import { loadOnlineLyricsState } from '../../src/utils/onlineLyricsState';

// dev/probes/appleLyricTiming.probe.tsx
const song: SongResult = { id:'TIMING-PROBE',name:'Timing fixture',artists:[],album:{id:1,name:'Fixture'},durationMs:60000,
    sourceRef:{kind:'online',providerId:'applemusic',mediaId:'TIMING-PROBE'} };
function Probe() {
    const [saved, setSaved] = useState('');
    const [mounted, setMounted] = useState(true);
    useEffect(() => {
        const getDraft = omni.getLyricDraft; const control = omni.controlExternalPlayback;
        let time = 1;
        omni.getLyricDraft = async () => ({text:'First line\nSecond line',source:'apple-library'});
        omni.controlExternalPlayback = async (_provider, operation, params) => {
            if (operation === 'seek') time = params.time || 0;
            const state = {mediaId:'TIMING-PROBE',time,duration:60,playing:true,status:'playing'};
            if (operation === 'state') time += 4;
            return state;
        };
        usePlaybackStore.getState().setCurrentSong(song);
        return () => { omni.getLyricDraft = getDraft; omni.controlExternalPlayback = control; };
    }, []);
    return <main className="mx-auto max-w-xl bg-zinc-900 p-6 text-white">
        <button onClick={() => usePlaybackStore.getState().setCurrentSong({...song,id:'OTHER',sourceRef:{kind:'online',providerId:'applemusic',mediaId:'OTHER'}})}>Switch fixture song</button>
        <button onClick={() => setMounted(!mounted)}>Toggle editor</button>
        {mounted && <AppleLyricTimingEditor song={song} onSaved={async () => {
            const state = await loadOnlineLyricsState(song); setSaved(JSON.stringify(state?.importedLyrics));
        }} />}
        <output data-testid="timing-saved">{saved}</output>
    </main>;
}
const definition: ProbeDefinition = {id:'appleLyricTiming',title:'Apple lyric timing',description:'Native-clock fixture, import and per-song storage',Component:Probe};
export default definition;
