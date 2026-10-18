import type { SongResult } from '../../types';
import { getPlaybackSongKey } from '../../utils/appPlaybackGuards';
import { getFromCache, saveToCache } from '../db';
import { requestAppleLyricMetadata } from './appleNeteaseLyricTools';
import { neteaseLyricArtist, neteaseLyricTitle } from './appleNeteaseLyricMatch';
import { useAppleSearchSettingsStore } from '../../stores/useAppleSearchSettingsStore';

// src/services/onlineMusic/appleLyricIdentities.ts
const pending = new Map<string, Promise<SongResult[]>>();
// Prefer trusted same-catalog-ID localizations, then explicit aliases, then the original spelling.
export async function getAppleLyricIdentities(song: SongResult): Promise<SongResult[]> {
    const key = `lyric_identities_v1_${getPlaybackSongKey(song)}`;
    if (pending.has(key)) return pending.get(key)!;
    const job = (async () => {
        const cached = await getFromCache<{ at: number; songs: SongResult[] }>(key);
        let localized = cached && Date.now() - cached.at < 30 * 86400000 ? cached.songs : [];
        if (!localized.length && !/\p{Script=Han}/u.test(song.name)) {
            try {
                const ref = song.sourceRef;
                const catalogId = ref?.kind === 'online' ? ref.providerData?.catalogId || ref.mediaId.replace(/^catalog:(?:[a-z]{2}:)?/i, '') : '';
                const url = ref?.kind === 'online' ? String(ref.providerData?.url || '') : '';
                const region = url.match(/music\.apple\.com\/([a-z]{2})\//i)?.[1] || useAppleSearchSettingsStore.getState().region;
                const result = await requestAppleLyricMetadata('localized', { title: song.name, artist: song.artists.map(a => a.name).join(', '),
                    durationMs: song.durationMs, catalogId, region });
                localized = (result?.songs || []).filter((item: SongResult) => item.name && item.artists?.length
                    && Math.abs(item.durationMs - song.durationMs) <= 3000);
                if (localized.length) await saveToCache(key, { at: Date.now(), songs: localized });
            } catch { /* Catalog availability never blocks the original identity or lyric sources. */ }
        }
        const alias = { ...song, name: neteaseLyricTitle(song), artists: song.artists.map(a => ({ ...a, name: neteaseLyricArtist(a.name) })) };
        return [...new Map([...localized, alias, song].map(item => [`${item.name}\0${item.artists.map(a => a.name).join(',')}`, item])).values()];
    })();
    pending.set(key, job);
    try { return await job; } finally { pending.delete(key); }
}
