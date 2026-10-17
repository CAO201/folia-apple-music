import type { UnifiedSong } from '../../types';
import type { ProviderCollection, ProviderPage } from '../../types/onlineMusic';
import type { AppleResource, AppleResponse } from '../../types/appleMusic';

// src/services/onlineMusic/appleMusicNormalize.ts
export function appleArtwork(resource: AppleResource): string | undefined {
    return resource.attributes?.artwork?.url.replace(/\{w\}/g, '1200').replace(/\{h\}/g, '1200').replace(/\{f\}/g, 'jpg');
}
export function normalizeAppleSong(raw: unknown): UnifiedSong {
    const resource = raw as AppleResource;
    const a = resource.attributes || {};
    const artist = resource.relationships?.artists?.data?.[0];
    const album = resource.relationships?.albums?.data?.[0];
    const catalogId = a.playParams?.catalogId;
    return {
        id: resource.id, name: a.name || '', durationMs: a.durationInMillis || 0,
        artists: [{ id: artist?.id || `artist:${a.artistName || ''}`, name: a.artistName || '',
            ...(artist ? { catalogRef: { providerId: 'applemusic', kind: 'artist' as const, id: artist.id } } : {}) }],
        album: { id: album?.id || `album:${a.albumName || ''}`, name: a.albumName || '', coverUrl: appleArtwork(resource),
            ...(album ? { catalogRef: { providerId: 'applemusic', kind: 'album' as const, id: album.id } } : {}) },
        sourceRef: { kind: 'online', providerId: 'applemusic', mediaId: resource.id,
            providerData: { resourceType: resource.type, catalogId: catalogId || '', isrc: a.isrc || '', url: a.url || '' } },
    };
}
export function normalizeAppleCollection(raw: unknown, kind?: string): ProviderCollection {
    const resource = raw as AppleResource;
    const a = resource.attributes || {};
    const type = kind || (resource.type.includes('album') ? 'album' : resource.type.includes('artist') ? 'artist' : 'playlist');
    return {
        providerId: 'applemusic', id: resource.id, name: a.name || '', type, coverUrl: appleArtwork(resource),
        trackCount: a.trackCount, description: a.description?.standard, isOwned: resource.type.startsWith('library-'),
        providerData: { resourceType: resource.type },
    };
}
export function applePage<T>(response: AppleResponse, normalize: (resource: AppleResource) => T, offset: number): ProviderPage<T> {
    const items = (response.data || []).map(normalize);
    return { items, total: response.meta?.total, hasMore: Boolean(response.next), nextOffset: offset + items.length };
}
