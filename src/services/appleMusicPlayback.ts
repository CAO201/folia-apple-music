import type { AppleMusicState } from '../types/appleMusic';
import { omni } from './onlineMusic/omni';
import { appleMusicSourceId, isAppleMusicSource } from '../utils/appleMusicSource';

// src/services/appleMusicPlayback.ts
let anchor: { source: string; state: AppleMusicState; at: number } | null = null;
let commandSequence = 0;
export function resetAppleMusicClock() { anchor = null; commandSequence++; }
export function getAppleMusicClock(source: string | null): { time: number; playing: boolean } | null {
    if (!anchor || anchor.source !== source) return null;
    const elapsed = anchor.state.playing ? Math.min(1.5, Math.max(0, (performance.now() - anchor.at) / 1000)) : 0;
    return { time: Math.min(anchor.state.duration || Infinity, anchor.state.time + elapsed), playing: anchor.state.playing };
}
export async function controlAppleMusic(operation: 'play' | 'resume' | 'pause' | 'stop' | 'seek' | 'state', source: string, time?: number): Promise<AppleMusicState | null> {
    if (!isAppleMusicSource(source)) return null;
    const sequence = ++commandSequence;
    // Capture before IPC: a newer poll must never overtake a seek or a track selection.
    const state = await omni.controlExternalPlayback('applemusic', operation, { mediaId: appleMusicSourceId(source), ...(time === undefined ? {} : { time }) });
    if (sequence !== commandSequence || !state || state.mediaId !== appleMusicSourceId(source)) return null;
    anchor = { source, state, at: performance.now() };
    return state;
}
