import { getAppleLibraryLyricDraft } from './appleLibraryLyrics';
import { hasDeclaredSentenceTimes, hasSentenceTimeline, parseSentenceLyrics } from '../../utils/lyrics/appleTiming';
import type { SongResult } from '../../types';
import type { ProviderLyricsResult } from '../../types/onlineMusic';
import { OnlineProviderError } from '../../types/onlineMusic';
import { appleLyricSearchQueries, selectAppleNeteaseLyricSong } from './appleNeteaseLyricMatch';
import { requestAppleLyricMetadata, fetchAppleNeteaseLyrics } from './appleNeteaseLyricTools';

// src/services/onlineMusic/appleMusicLyrics.ts
// The Apple Music provider owns playback; NetEase supplies lyrics and matching metadata only.
export async function getAppleNeteaseTimedLyrics(song: SongResult): Promise<ProviderLyricsResult> {
    try {
        let matched: SongResult | null = null;
        const identities = [song];
        let pool: SongResult[] = [];
        for (const keywords of appleLyricSearchQueries(song).slice(0, 2)) {
            const result = await requestAppleLyricMetadata('search', { keywords });
            matched = selectAppleNeteaseLyricSong(song, result?.songs || []);
            if (matched) { pool = result?.songs || []; break; }
        }
        if (!matched) {
            // A same-ID catalog lookup may supply a localized name. Failure never blocks playback or manual correction.
            try {
                if (/\p{Script=Han}/u.test(song.name)) throw new Error('Already a Chinese title');
                const ref = song.sourceRef;
                const data = await requestAppleLyricMetadata('localized', { title: song.name,
                    artist: song.artists.map(a => a.name).join(', '), durationMs: song.durationMs,
                    catalogId: ref?.kind === 'online' ? ref.providerData?.catalogId : undefined });
                identities.push(...(data?.songs || []));
            } catch { /* Metadata is optional; retain the original identity. */ }
            const seen = new Set(appleLyricSearchQueries(song).slice(0, 2));
            for (const identity of identities) {
                for (const keywords of appleLyricSearchQueries(identity)) {
                    if (seen.has(keywords)) continue;
                    seen.add(keywords);
                    const data = await requestAppleLyricMetadata('search', { keywords });
                    matched = identities.map(target => selectAppleNeteaseLyricSong(target, data?.songs || [])).find(Boolean) || null;
                    if (matched) { pool = data?.songs || []; break; }
                }
                if (matched) break;
            }
        }
        if (!matched) return { lyrics: null, isPureMusic: false };
        const candidates = [matched, ...pool.filter(candidate => candidate.id !== matched!.id
            && identities.some(identity => selectAppleNeteaseLyricSong(identity, [candidate])))];
        let pureMusic = false;
        for (const candidate of [...new Map(candidates.map(item => [String(item.id), item])).values()].slice(0, 3)) {
            try {
                const processed = await fetchAppleNeteaseLyrics(String(candidate.id));
                if (processed.isPureMusic) { pureMusic = true; continue; }
                if (!hasDeclaredSentenceTimes(processed.yrcLrc || processed.mainLrc || '', processed.yrcLrc ? 'yrc' : 'lrc')
                    || !hasSentenceTimeline(processed.lyrics, song.durationMs)) continue;
                processed.lyrics.appleLyricsOrigin = 'netease';
                return { lyrics: processed.lyrics, mainText: processed.mainLrc, wordByWordText: processed.yrcLrc,
                    translationText: processed.transLrc, romanizationText: processed.romanizationLrc, isPureMusic: false };
            } catch { /* A missing lyric on one exact recording does not hide the next candidate. */ }
        }
        return { lyrics: null, isPureMusic: pureMusic };

    } catch (error) {
        throw new OnlineProviderError('network', error instanceof Error ? error.message : '网易云歌词请求失败。', 'applemusic');
    }
}

// NetEase remains first. Apple library text is only displayed when it already carries real timestamps.
export async function getAppleMusicLyrics(song: SongResult): Promise<ProviderLyricsResult> {
    let pureMusic = false;
    try {
        const netease = await getAppleNeteaseTimedLyrics(song);
        if (hasSentenceTimeline(netease.lyrics, song.durationMs)) return netease;
        pureMusic = netease.isPureMusic;
    } catch { /* A NetEase outage must not block the independent library fallback. */ }
    const draft = await getAppleLibraryLyricDraft(song);
    const lyrics = draft.text ? parseSentenceLyrics(draft.text, song.durationMs) : null;
    if (lyrics) lyrics.appleLyricsOrigin = 'apple-library';
    return { lyrics, mainText: lyrics ? draft.text : null, isPureMusic: lyrics ? false : pureMusic };
}
