import { useEffect, useRef, useState } from 'react';
import type { LyricData, SongResult } from '../types';
import { omni } from '../services/onlineMusic/omni';
import { usePlaybackStore } from '../stores/usePlaybackStore';
import { isSamePlaybackSong } from '../utils/appPlaybackGuards';
import { alignSentenceText, buildSentenceTimeline, parseSentenceLyrics } from '../utils/lyrics/appleTiming';
import { saveAppleTimedLyrics } from '../services/appleMusicLyricTiming';
import { getFromCache, saveToCache } from '../services/db';
import { getSongResourceCacheKey } from '../services/onlineMusic/resourceKeys';

// src/hooks/useAppleLyricTiming.ts
export function useAppleLyricTiming(song: SongResult, onSaved: () => void | Promise<void>, seed = '') {
    const [text, setText] = useState(seed);
    const [times, setTimes] = useState<number[]>([]);
    const [ready, setReady] = useState(false);
    const [busy, setBusy] = useState(false);
    const [feedback, setFeedback] = useState('');
    const generation = useRef(0);
    const touched = useRef(Boolean(seed));
    const busyRef = useRef(false);
    const latest = useRef({ text, times, ready });
    latest.current = { text, times, ready };
    const key = `${getSongResourceCacheKey('lyric', song)}_timing_draft`;
    const rows = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    useEffect(() => {
        const request = ++generation.current;
        void getFromCache<{ text: string; times: number[] }>(key).then(draft => {
            if (request !== generation.current) return;
            if (!touched.current && draft && typeof draft.text === 'string' && Array.isArray(draft.times)) {
                setText(draft.text); setTimes(draft.times.every(Number.isFinite) ? draft.times : []);
            }
            setReady(true);
        }).catch(() => { if (request === generation.current) setReady(true); });
        return () => {
            generation.current++;
            if (touched.current && latest.current.ready) void saveToCache(key, { text: latest.current.text, times: latest.current.times }).catch(() => {});
        };
    }, [key]);
    useEffect(() => {
        if (!ready || !touched.current) return;
        const timer = window.setTimeout(() => { void saveToCache(key, { text, times }).catch(() => {}); }, 600);
        return () => window.clearTimeout(timer);
    }, [key, ready, text, times]);
    const changeText = (value: string) => { touched.current = true; setText(value); setTimes([]); setFeedback(''); };
    const run = async (work: () => Promise<void>) => {
        if (busyRef.current) return;
        busyRef.current = true;
        setBusy(true); setFeedback('');
        const request = generation.current;
        try { await work(); } catch (error) {
            if (request === generation.current) setFeedback(error instanceof Error ? error.message : 'appleTiming.failed');
        } finally { busyRef.current = false; if (request === generation.current) setBusy(false); }
    };
    const nativeState = async () => {
        if (!isSamePlaybackSong(usePlaybackStore.getState().currentSong, song)) throw new Error('appleTiming.wrongSong');
        const ref = song.sourceRef;
        if (ref?.kind !== 'online') throw new Error('appleTiming.wrongSong');
        const state = await omni.controlExternalPlayback('applemusic', 'state', { mediaId: ref.mediaId });
        if (!isSamePlaybackSong(usePlaybackStore.getState().currentSong, song) || state.mediaId !== ref.mediaId
            || !['playing', 'paused'].includes(state.status) || !Number.isFinite(state.time)) throw new Error('appleTiming.wrongSong');
        return state;
    };
    const tap = () => run(async () => {
        if (!rows.length || times.length >= rows.length) return;
        const request = generation.current;
        const state = await nativeState();
        if (request !== generation.current) return;
        if (state.time < 0 || state.time >= song.durationMs / 1000 || (times.length && state.time <= times[times.length - 1])) throw new Error('appleTiming.order');
        touched.current = true; setTimes([...times, state.time]);
    });
    const loadApple = () => run(async () => {
        const request = generation.current;
        const draft = await omni.getLyricDraft(song);
        if (request !== generation.current) return;
        if (!draft?.text) { setFeedback(draft?.reason === 'unavailable' ? 'appleTiming.appleUnavailable' : 'appleTiming.appleEmpty'); return; }
        changeText(draft.text); setFeedback('appleTiming.appleLoaded');
    });
    const save = (data?: LyricData | null, name = 'appleTiming.manualName') => run(async () => {
        const request = generation.current;
        const lyrics = data || buildSentenceTimeline(text, times, song.durationMs / 1000);
        await saveAppleTimedLyrics(song, lyrics, name);
        if (request !== generation.current) return;
        if (isSamePlaybackSong(usePlaybackStore.getState().currentSong, song)) await onSaved();
        if (request === generation.current) setFeedback('appleTiming.saved');
    });
    const importText = (content: string) => {
        const parsed = parseSentenceLyrics(content, song.durationMs);
        if (parsed) return save(parsed, 'appleTiming.importedName');
        changeText(content); setFeedback('appleTiming.needsTiming');
    };
    const align = () => {
        const current = usePlaybackStore.getState();
        const matched = isSamePlaybackSong(current.currentSong, song) && current.lyrics
            ? alignSentenceText(text, current.lyrics, song.durationMs) : null;
        if (!matched) { setFeedback('appleTiming.cannotAlign'); return; }
        void save(matched, 'appleTiming.alignedName');
    };
    const audition = (index: number) => run(async () => {
        await nativeState();
        const ref = song.sourceRef;
        if (ref?.kind === 'online' && Number.isFinite(times[index])) await omni.controlExternalPlayback('applemusic', 'seek', { mediaId: ref.mediaId, time: times[index] });
    });
    return { text, times, rows, ready, busy, feedback, changeText, tap, loadApple, save: () => save(), importText, align, audition,
        useTimestamps: () => {
            const parsed = parseSentenceLyrics(text, song.durationMs);
            if (!parsed) { setFeedback('appleTiming.needsTiming'); return; }
            void save(parsed, 'appleTiming.importedName');
        },
        reportFileError: () => setFeedback('appleTiming.fileError'),
        undo: () => { touched.current = true; setTimes(times.slice(0, -1)); setFeedback(''); },
        editTime: (index: number, value: number) => { touched.current = true; setTimes(times.map((time, i) => i === index ? value : time)); },
    };
}
