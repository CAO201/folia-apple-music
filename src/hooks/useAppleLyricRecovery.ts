import { useEffect, useRef } from 'react';
import type { LyricData } from '../types';
import { PlayerState } from '../types';
import { usePlaybackStore } from '../stores/usePlaybackStore';
import { useAppleLyricRecoveryStore } from '../stores/useAppleLyricRecoveryStore';
import { getPlaybackSongKey, isSamePlaybackSong } from '../utils/appPlaybackGuards';
import { hasSentenceTimeline } from '../utils/lyrics/appleTiming';
import { createMissingLyricsTimer } from '../utils/lyrics/missingLyricsTimer';
import { loadOnlineLyricsState } from '../utils/onlineLyricsState';
import { omni } from '../services/onlineMusic/omni';

// src/hooks/useAppleLyricRecovery.ts
export function useAppleLyricRecovery(setLyrics: (lyrics: LyricData | null) => void) {
    const apply = useRef(setLyrics);
    apply.current = setLyrics;
    useEffect(() => {
        const timer = createMissingLyricsTimer(async (key, signal) => {
            const song = usePlaybackStore.getState().currentSong;
            if (!song) return;
            const state = await loadOnlineLyricsState(song);
            if (signal.aborted || (state?.lyricsSource === 'imported' && state.importedLyrics) || state?.hasOnlineOverride) return;
            useAppleLyricRecoveryStore.setState({ key, phase: 'searching', candidates: [] });
            try {
                const result = await omni.recoverLyrics(song, { signal });
                const manual = await loadOnlineLyricsState(song);
                const latest = usePlaybackStore.getState();
                if (signal.aborted || !isSamePlaybackSong(latest.currentSong, song)
                    || hasSentenceTimeline(latest.lyrics, song.durationMs)
                    || (manual?.lyricsSource === 'imported' && manual.importedLyrics) || manual?.hasOnlineOverride) return;
                useAppleLyricRecoveryStore.setState({ key, phase: result.lyrics ? 'found' : 'missing', candidates: result.candidates || [] });
                if (result.lyrics) {
                    latest.setCurrentSong(prev => isSamePlaybackSong(prev, song) ? { ...prev!, isPureMusic: false } : prev);
                    apply.current(result.lyrics);
                    latest.setCurrentLineIndex(-1);
                }
            } catch {
                if (!signal.aborted) useAppleLyricRecoveryStore.setState({ key, phase: 'missing', candidates: [] });
            }
        });
        const update = () => {
            const { currentSong: song, playerState, lyrics } = usePlaybackStore.getState();
            const apple = song?.sourceRef?.kind === 'online' && song.sourceRef.providerId === 'applemusic';
            const key = apple ? getPlaybackSongKey(song) : '';
            if (useAppleLyricRecoveryStore.getState().key !== key) useAppleLyricRecoveryStore.setState({ key, phase: 'idle', candidates: [] });
            if (hasSentenceTimeline(lyrics, song?.durationMs) && useAppleLyricRecoveryStore.getState().phase === 'searching')
                useAppleLyricRecoveryStore.setState({ phase: 'idle', candidates: [] });
            timer.update({ key, playing: playerState === PlayerState.PLAYING, hasLyrics: hasSentenceTimeline(lyrics, song?.durationMs) });
        };
        // Subscribe only to discrete song/transport/lyric changes, never the per-frame playback clock.
        const unsubscribe = usePlaybackStore.subscribe((state, previous) => {
            if (state.currentSong !== previous.currentSong || state.playerState !== previous.playerState || state.lyrics !== previous.lyrics) update();
        });
        update();
        return () => { unsubscribe(); timer.dispose(); };
    }, []);
}
