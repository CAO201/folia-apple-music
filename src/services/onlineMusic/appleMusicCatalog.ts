import type { AppleResponse } from '../../types/appleMusic';
import type { MediaId, OnlineCatalogProvider, ProviderCollection } from '../../types/onlineMusic';
import { appleApi, appleCatalogPath } from './appleMusicTransport';
import { applePage, normalizeAppleCollection, normalizeAppleSong } from './appleMusicNormalize';

// src/services/onlineMusic/appleMusicCatalog.ts
const encode = (id: MediaId) => encodeURIComponent(String(id));
async function resourcePath(kind: string, id: MediaId, collection?: ProviderCollection) {
    const library = /^[A-F0-9]{16}$/i.test(String(id)) || String(id).startsWith('album:') || String(id).startsWith('i.') || String(id).startsWith('p.') || collection?.providerData?.resourceType === `library-${kind}`;
    return library ? `/v1/me/library/${kind}/${encode(id)}` : appleCatalogPath(`${kind}/${encode(id)}`);
}
async function tracks(kind: string, id: MediaId, limit: number, offset: number, collection?: ProviderCollection) {
    return applePage(await appleApi<AppleResponse>(`${await resourcePath(kind, id, collection)}/tracks`, {
        limit: String(Math.min(100, limit)), offset: String(offset), include: 'albums,artists',
    }), normalizeAppleSong, offset);
}
async function detail(kind: string, id: MediaId, type: string, collection?: ProviderCollection) {
    if (collection?.providerData?.resourceType?.toString().startsWith('library-')) return collection;
    const response = await appleApi<AppleResponse>(await resourcePath(kind, id, collection));
    return response.data?.[0] ? normalizeAppleCollection(response.data[0], type) : null;
}
export const appleMusicCatalog: OnlineCatalogProvider = {
    getPlaylistTracks: async (id, limit, offset, collection) => id === 'apple-library-songs'
        ? applePage(await appleApi<AppleResponse>('/v1/me/library/songs', { limit: String(Math.min(100, limit)), offset: String(offset), include: 'albums,artists' }), normalizeAppleSong, offset)
        : tracks('playlists', id, limit, offset, collection),
    getPlaylistDetail: (id, collection) => id === 'apple-library-songs' ? Promise.resolve(collection || { providerId: 'applemusic', id, name: 'Apple Music', type: 'playlist' }) : detail('playlists', id, 'playlist', collection),
    getAlbumTracks: (id, limit = 100, offset = 0, collection) => tracks('albums', id, limit, offset, collection),
    getAlbumDetail: (id, collection) => detail('albums', id, 'album', collection),
    getArtistDetail: id => detail('artists', id, 'artist'),
    async getArtistSongs(id, limit, offset) {
        return applePage(await appleApi<AppleResponse>(await appleCatalogPath(`artists/${encode(id)}/view/top-songs`), {
            limit: String(Math.min(limit, 20)), offset: String(offset),
        }), normalizeAppleSong, offset);
    },
    async getArtistAlbums(id, limit, offset) {
        return applePage(await appleApi<AppleResponse>(await appleCatalogPath(`artists/${encode(id)}/albums`), {
            limit: String(Math.min(limit, 100)), offset: String(offset),
        }), resource => normalizeAppleCollection(resource, 'album'), offset);
    },
};
