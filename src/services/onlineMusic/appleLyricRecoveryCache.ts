import type { LyricData, SongResult } from '../../types';
import { getFromCache, saveToCache } from '../db';
import { getSongResourceCacheKey } from './resourceKeys';
import { hasSentenceTimeline } from '../../utils/lyrics/appleTiming';

// src/services/onlineMusic/appleLyricRecoveryCache.ts
const key = (song: SongResult) => `lyric_recovered_v1_${getSongResourceCacheKey('lyric', song)}`;
export async function readRecoveredAppleLyrics(song: SongResult): Promise<LyricData | null> {
    try {
        const entry = await getFromCache<{ fingerprint: string; lyrics: LyricData }>(key(song));
        return entry?.fingerprint === fingerprint(song) && hasSentenceTimeline(entry.lyrics, song.durationMs) ? entry.lyrics : null;
    } catch { return null; }
}
const fingerprint = (song: SongResult) => JSON.stringify([song.name, song.artists.map(a => a.name), song.durationMs]);
export async function cacheRecoveredAppleLyrics(song: SongResult, lyrics: LyricData): Promise<void> {
    if (!hasSentenceTimeline(lyrics, song.durationMs)) return;
    await saveToCache(key(song), { fingerprint: fingerprint(song), lyrics });
    await saveToCache(getSongResourceCacheKey('lyric', song), lyrics);
}
