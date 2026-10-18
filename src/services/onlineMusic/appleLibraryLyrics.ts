import type { SongResult } from '../../types';
import type { ProviderLyricDraft } from '../../types/onlineMusic';
import { requestAppleMusic } from './appleMusicTransport';

// src/services/onlineMusic/appleLibraryLyrics.ts
export async function getAppleLibraryLyricDraft(song: SongResult): Promise<ProviderLyricDraft> {
    const ref = song.sourceRef;
    if (ref?.kind !== 'online' || ref.providerId !== 'applemusic') return { text: '', source: 'apple-library', reason: 'unavailable' };
    try {
        const data = await requestAppleMusic<{ text?: string; reason?: 'not-in-library' }>('lyrics', { mediaId: ref.mediaId });
        const text = String(data.text || '').trim();
        return { text, source: 'apple-library', reason: text ? undefined : data.reason || 'empty' };
    } catch { return { text: '', source: 'apple-library', reason: 'unavailable' }; }
}
