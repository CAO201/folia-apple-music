import type { SongResult } from '../types';
import { omni } from './onlineMusic/omni';
import { getSongResourceCacheKey } from './onlineMusic/resourceKeys';
import { saveToCache } from './db';
import { loadOnlineLyricsState, resolveOnlineLyrics, resolveOnlineLyricsPureMusic } from '../utils/onlineLyricsState';

// src/services/appleMusicLyricRefresh.ts
// Keep the legacy best-match action on the same NetEase-first provider path as normal playback.
export async function refreshAppleTimedLyrics(song: SongResult) {
    const state = await loadOnlineLyricsState(song);
    if ((state?.lyricsSource === 'imported' && state.importedLyrics) || state?.hasOnlineOverride) {
        const lyrics = resolveOnlineLyrics(state, null);
        return {state,lyrics,isPureMusic:resolveOnlineLyricsPureMusic(state,lyrics?.lines.map(line => line.fullText).join('\n') || '')};
    }
    let result = await omni.getLyrics(song);
    if (!result.lyrics) result = await omni.recoverLyrics(song, { force: true });
    if (result.lyrics) await saveToCache(getSongResourceCacheKey('lyric',song),result.lyrics);
    return {state,lyrics:result.lyrics,isPureMusic:result.isPureMusic};
}
