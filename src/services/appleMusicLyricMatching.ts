import type { SongResult } from '../types';
import { loadOnlineLyricsState, saveOnlineLyricsState } from '../utils/onlineLyricsState';
import { hasDeclaredSentenceTimes, hasSentenceTimeline } from '../utils/lyrics/appleTiming';
import { fetchAppleNeteaseLyrics, searchAppleNeteaseLyrics } from './onlineMusic/appleNeteaseLyricTools';

// src/services/appleMusicLyricMatching.ts
// Explicit cross-provider correction: only lyrics cross the boundary; the Apple playback identity is untouched.
export const searchAppleLyricCandidates = searchAppleNeteaseLyrics;
export async function previewAppleLyricCandidate(candidate: SongResult) {
    return fetchAppleNeteaseLyrics(String(candidate.id));
}
export async function saveAppleLyricCandidate(song: SongResult, candidate: SongResult) {
    const processed = await previewAppleLyricCandidate(candidate);
    if (!processed.isPureMusic && (!hasSentenceTimeline(processed.lyrics, song.durationMs) || !hasDeclaredSentenceTimes(processed.yrcLrc || processed.mainLrc || '', processed.yrcLrc ? 'yrc' : 'lrc'))) throw new Error('此版本没有可靠的逐句时间轴，请选择其他版本或逐句打点。');
    const previous = await loadOnlineLyricsState(song);
    await saveOnlineLyricsState(song, { ...previous, lyricsSource: 'online', hasOnlineOverride: true,
        onlineOverrideLyrics: processed.lyrics, matchedSongId: candidate.id, matchedIsPureMusic: processed.isPureMusic,
        matchedLyricsSource: 'netease', matchedLyricsProviderPlatform: undefined });
}
