import type { SongResult } from '../../types';
import type { ProviderLyricsResult } from '../../types/onlineMusic';
import { OnlineProviderError } from '../../types/onlineMusic';
import { appleLyricSearchQueries, selectAppleNeteaseLyricSong } from './appleNeteaseLyricMatch';
import { requestAppleLyricMetadata, fetchAppleNeteaseLyrics } from './appleNeteaseLyricTools';

// src/services/onlineMusic/appleMusicLyrics.ts
// The Apple Music provider owns playback; NetEase supplies lyrics and matching metadata only.
export async function getAppleMusicLyrics(song: SongResult): Promise<ProviderLyricsResult> {
    try {
        let matched: SongResult | null = null;
        const identities = [song];
        for (const keywords of appleLyricSearchQueries(song).slice(0, 2)) {
            const result = await requestAppleLyricMetadata('search', { keywords });
            matched = selectAppleNeteaseLyricSong(song, result?.songs || []);
            if (matched) break;
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
                    if (matched) break;
                }
                if (matched) break;
            }
        }
        if (!matched) return { lyrics: null, isPureMusic: false };
        const processed = await fetchAppleNeteaseLyrics(String(matched.id));
        return { lyrics: processed.lyrics, mainText: processed.mainLrc, wordByWordText: processed.yrcLrc,
            translationText: processed.transLrc, romanizationText: processed.romanizationLrc, isPureMusic: processed.isPureMusic };
    } catch (error) {
        throw new OnlineProviderError('network', error instanceof Error ? error.message : '网易云歌词请求失败。', 'applemusic');
    }
}
