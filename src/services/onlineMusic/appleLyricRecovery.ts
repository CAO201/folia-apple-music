import { awaitLyricRequest, lyricPriorityGrace } from '../../utils/lyrics/lyricRequestLifetime';
import type { SongResult } from '../../types';
import type { FallbackLyricCandidate, FallbackLyricsResult } from '../../types/onlineMusic';
import { getFromCache, saveToCache } from '../db';
import { getPlaybackSongKey } from '../../utils/appPlaybackGuards';
import { hasSentenceTimeline } from '../../utils/lyrics/appleTiming';
import { appleLyricSearchQueries, selectAppleNeteaseLyricSong, appleLyricMatchScore } from './appleNeteaseLyricMatch';
import { getAppleLyricIdentities } from './appleLyricIdentities';
import { getAppleNeteaseTimedLyrics } from './appleMusicLyrics';
import { fetchExternalLyrics, searchExternalLyrics, type ExternalLyricSource } from './appleExternalLyricTools';
import { readRecoveredAppleLyrics, cacheRecoveredAppleLyrics } from './appleLyricRecoveryCache';

// src/services/onlineMusic/appleLyricRecovery.ts
const empty = (): FallbackLyricsResult => ({ lyrics: null, isPureMusic: false, candidates: [] });
const running = new Map<string, Promise<FallbackLyricsResult>>();
// Explicit cross-source lyric fallback. Playback identities and audio never leave the Apple provider.
export async function recoverAppleLyrics(song: SongResult, options: { signal?: AbortSignal; force?: boolean } = {}): Promise<FallbackLyricsResult> {
    const key = getPlaybackSongKey(song);
    options.signal?.throwIfAborted();
    if (!options.force) {
        const lyrics = await readRecoveredAppleLyrics(song);
        if (lyrics) return { lyrics, isPureMusic: false };
        const failedAt = await getFromCache<number>(`lyric_recovery_cooldown_${key}`);
        if (failedAt && Date.now() - failedAt < 10 * 60000) return empty();
    }
    if (running.has(key)) return running.get(key)!;
    const signal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(45000)]) : AbortSignal.timeout(45000);
    const job = (async () => {
        // Reuse main-process request caching so the five-second retry doesn't duplicate NetEase traffic.
        const neteaseJob = getAppleNeteaseTimedLyrics(song).catch(() => null);
        const netease = await lyricPriorityGrace(neteaseJob, signal);
        signal.throwIfAborted();
        if (hasSentenceTimeline(netease?.lyrics, song.durationMs)) {
            await cacheRecoveredAppleLyrics(song, netease.lyrics);
            return { ...netease, candidates: [] };
        }
        const identities = await awaitLyricRequest(getAppleLyricIdentities(song), signal);
        signal.throwIfAborted();
        const localizedQueries = [...new Set(identities.flatMap(item => appleLyricSearchQueries(item).slice(0, 2)))];
        const originalQuery = `${song.name} ${song.artists.map(a => a.name).join(' ')}`.trim();
        const results = await Promise.all((['qq', 'kugou', 'lrclib'] as const).map(async source => {
            const deadline = new AbortController();
            const timeout = setTimeout(() => deadline.abort(new DOMException('Lyric source timeout', 'TimeoutError')), 20000);
            const sourceSignal = AbortSignal.any([signal, deadline.signal]);
            const queries = source === 'lrclib'
                ? [...new Set([originalQuery, song.name, ...localizedQueries])].slice(0, 4)
                : [...new Set([...localizedQueries.slice(0, 3), originalQuery])];
            try {
                const candidates = new Map<string, FallbackLyricCandidate>();
                for (const query of queries) {
                    sourceSignal.throwIfAborted();
                    try {
                        const songs = await awaitLyricRequest(searchExternalLyrics(source, query, sourceSignal), sourceSignal);
                        for (const candidate of songs) {
                            const target = identities.find(identity => selectAppleNeteaseLyricSong(identity, [candidate]));
                            if (!target) continue;
                            const score = appleLyricMatchScore(target, candidate);
                            // An album match can support small encoding-duration differences; never use duration alone.
                            const automatic = score.artistSimilarity >= 0.7 && (Math.abs(candidate.durationMs - song.durationMs) <= 2000 || score.albumMatched === true);
                            candidates.set(String(candidate.id), { source, song: candidate, automatic });
                        }
                        if (candidates.size) break;
                    } catch { sourceSignal.throwIfAborted(); }
                }
                for (const candidate of [...candidates.values()].filter(item => item.automatic).slice(0, 3)) {
                    try {
                        const result = await awaitLyricRequest(fetchExternalLyrics(source, candidate.song, song, sourceSignal), sourceSignal);
                        if (hasSentenceTimeline(result.lyrics, song.durationMs)) return { ...result, candidates: [...candidates.values()] };
                    } catch { sourceSignal.throwIfAborted(); }
                }
                return { ...empty(), candidates: [...candidates.values()].slice(0, 3) };
            } catch {
                signal.throwIfAborted();
                return empty(); // A stalled source must not discard another source's successful result.
            } finally { clearTimeout(timeout); }
        }));
        signal.throwIfAborted();
        // Prefer NetEase if it completed while the independent sources were being searched.
        const finalNetease = await lyricPriorityGrace(neteaseJob, signal, 1);
        if (hasSentenceTimeline(finalNetease?.lyrics, song.durationMs)) {
            await cacheRecoveredAppleLyrics(song, finalNetease.lyrics);
            return { ...finalNetease, candidates: [] };
        }
        const best = results.find(result => hasSentenceTimeline(result.lyrics, song.durationMs));
        if (best?.lyrics) {
            await cacheRecoveredAppleLyrics(song, best.lyrics);
            return best;
        }
        await saveToCache(`lyric_recovery_cooldown_${key}`, Date.now());
        return { ...empty(), candidates: results.flatMap(result => result.candidates || []).slice(0, 9) };
    })();
    running.set(key, job);
    try { const result = await job; options.signal?.throwIfAborted(); return result; }
    finally { if (running.get(key) === job) running.delete(key); }
}
export async function selectRecoveredAppleLyric(song: SongResult, candidate: FallbackLyricCandidate, signal?: AbortSignal) {
    const lyrics = await fetchExternalLyrics(candidate.source as ExternalLyricSource, candidate.song, song, signal);
    signal?.throwIfAborted();
    if (!hasSentenceTimeline(lyrics.lyrics, song.durationMs)) throw new Error('appleRecovery.noTimedCandidate');
    return lyrics;
}
