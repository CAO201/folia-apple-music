import i18n from '../i18n/config';
import type { LyricData, SongResult } from '../types';
import { loadOnlineLyricsState, saveOnlineLyricsState } from '../utils/onlineLyricsState';
import { hasSentenceTimeline } from '../utils/lyrics/appleTiming';

// src/services/appleMusicLyricTiming.ts
export async function saveAppleTimedLyrics(song: SongResult, lyrics: LyricData, name: string) {
    if (song.sourceRef?.kind !== 'online' || song.sourceRef.providerId !== 'applemusic'
        || !hasSentenceTimeline(lyrics, song.durationMs)) throw new Error('appleTiming.invalidTimes');
    const previous = await loadOnlineLyricsState(song);
    await saveOnlineLyricsState(song, { ...previous, lyricsSource: 'imported', importedLyrics: { ...lyrics, appleLyricsOrigin: 'manual' }, importedLyricsName: i18n.t(name, { defaultValue: name }) });
}
