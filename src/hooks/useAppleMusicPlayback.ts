import { useEffect, useRef } from 'react';
import { PlayerState } from '../types';
import { usePlaybackStore } from '../stores/usePlaybackStore';
import { useAudioSettingsStore } from '../stores/useAudioSettingsStore';
import { setStatusMessage } from '../stores/useStatusMessageStore';
import { controlAppleMusic, resetAppleMusicClock } from '../services/appleMusicPlayback';
import { omni } from '../services/onlineMusic/omni';
import { isAppleMusicSource } from '../utils/appleMusicSource';

// src/hooks/useAppleMusicPlayback.ts
// A bounded IPC poll updates a non-React clock; the existing visualizer loop interpolates it.
export function useAppleMusicPlayback(onEnded: () => void | Promise<void>) {
    const source = usePlaybackStore(state => state.audioSrc);
    const volume = useAudioSettingsStore(state => state.volume);
    const muted = useAudioSettingsStore(state => state.isMuted);
    const onEndedRef = useRef(onEnded);
    onEndedRef.current = onEnded;
    useEffect(() => {
        if (!isAppleMusicSource(source)) return;
        let disposed = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        let hasPlayed = false;
        let finished = false;
        let failures = 0;
        resetAppleMusicClock();
        const current = () => !disposed && usePlaybackStore.getState().audioSrc === source;
        const synchronize = async (operation: 'play' | 'state') => {
            try {
                const state = await controlAppleMusic(operation, source);
                if (!current() || !state) return;
                failures = 0;
                const store = usePlaybackStore.getState();
                if (state.duration > 0 && state.duration !== store.duration) store.setDuration(state.duration);
                const next = state.playing ? PlayerState.PLAYING : PlayerState.PAUSED;
                if (store.playerState !== next) store.setPlayerState(next);
                hasPlayed ||= state.playing;
                const ended = state.status === 'ended' || (hasPlayed && !state.playing && state.duration > 0 && state.time >= state.duration - 0.25);
                if (!finished && ended) {
                    finished = true;
                    if (useAudioSettingsStore.getState().loopMode === 'one') {
                        await controlAppleMusic('seek', source, 0);
                        await controlAppleMusic('resume', source);
                        hasPlayed = false;
                        finished = false;
                    } else { void onEndedRef.current(); }
                }
            } catch (error) {
                if (!current()) return;
                failures++;
                if (operation === 'play' || failures >= 3) {
                    finished = true;
                    usePlaybackStore.getState().setPlayerState(PlayerState.PAUSED);
                    setStatusMessage({ type: 'error', text: error instanceof Error ? error.message : String(error) });
                }
            } finally {
                if (current() && !finished) timer = setTimeout(() => void synchronize('state'), 750);
            }
        };
        void synchronize('play');
        return () => {
            disposed = true;
            clearTimeout(timer);
            resetAppleMusicClock();
            void controlAppleMusic('stop', source).catch(() => {});
        };
    }, [source]);
    useEffect(() => {
        if (!isAppleMusicSource(source)) return;
        const timer = setTimeout(() => {
            void omni.setExternalPlaybackVolume('applemusic', volume, muted).catch(() => {});
        }, 100);
        return () => clearTimeout(timer);
    }, [source, volume, muted]);
}

