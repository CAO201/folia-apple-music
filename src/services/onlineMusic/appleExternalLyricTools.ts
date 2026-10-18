import { awaitLyricRequest } from '../../utils/lyrics/lyricRequestLifetime';
import type { SongResult } from '../../types';
import type { ProviderLyricsResult } from '../../types/onlineMusic';
import { parseSentenceLyrics } from '../../utils/lyrics/appleTiming';
import { decodeKugouDownloadedLyric } from '../../utils/lyrics/providers/kugouLyricProvider';
import { selectAppleNeteaseLyricSong } from './appleNeteaseLyricMatch';

// src/services/onlineMusic/appleExternalLyricTools.ts
export type ExternalLyricSource = 'qq' | 'kugou' | 'lrclib';
async function request(operation: 'external-search' | 'external-lyrics', params: Record<string, unknown>, signal?: AbortSignal) {
    signal?.throwIfAborted();
    const bridge = window.electron?.neteaseLyricsRequest;
    if (!bridge) throw new Error('Desktop lyric bridge unavailable');
    const result = await awaitLyricRequest(bridge(operation, params), signal);
    signal?.throwIfAborted();
    if (!result.ok) throw new Error(result.error || 'Lyric source unavailable');
    return result.data;
}
export async function searchExternalLyrics(provider: ExternalLyricSource, keywords: string, signal?: AbortSignal): Promise<SongResult[]> {
    return (await request('external-search', { provider, keywords }, signal))?.songs || [];
}
export async function fetchExternalLyrics(provider: ExternalLyricSource, candidate: SongResult, target: SongResult, signal?: AbortSignal): Promise<ProviderLyricsResult> {
    const data = await request('external-lyrics', { provider, id: String(candidate.id), durationMs: target.durationMs,
        keywords: `${candidate.artists.map(a => a.name).join(' ')} - ${candidate.name}` }, signal);
    const texts: { text: string; format?: 'lrc' | 'enhanced-lrc' | 'vtt' | 'krc' }[] = [];
    if (provider === 'kugou') {
        for (const item of data?.downloads || []) {
            if (!selectAppleNeteaseLyricSong(candidate, [item.song])) continue;
            const bytes = Uint8Array.from(atob(item.content), c => c.charCodeAt(0));
            const decoded = await decodeKugouDownloadedLyric(bytes, item.contenttype);
            texts.push({ text: decoded.lyricText, format: decoded.format });
        }
    } else texts.push({ text: String(data?.text || ''), format: 'lrc' });
    for (const { text, format } of texts) {
        const lyrics = parseSentenceLyrics(text, target.durationMs, format);
        if (!lyrics) continue;
        lyrics.appleLyricsOrigin = provider;
        lyrics.appleLyricsMatch = { sourceId: String(candidate.id), title: candidate.name,
            artist: candidate.artists.map(a => a.name).join(', '), fetchedAt: Date.now() };
        return { lyrics, mainText: text, isPureMusic: false };
    }
    return { lyrics: null, isPureMusic: false };
}
