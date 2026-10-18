import i18n from '../../i18n/config';
import { useAppleSearchSettingsStore } from '../../stores/useAppleSearchSettingsStore';
import { alternateAppleSearchQuery } from '../../utils/appleSearchQueries';
import type { OnlineMusicProvider, ProviderUser } from '../../types/onlineMusic';
import { OnlineProviderError } from '../../types/onlineMusic';
import type { AppleResponse } from '../../types/appleMusic';
import { createProviderSongMetadata } from '../../utils/songMetadata';
import { requestAppleMusic, appleApi, appleCatalogPath, clearAppleMusicSession } from './appleMusicTransport';
import { normalizeAppleSong, normalizeAppleCollection, applePage } from './appleMusicNormalize';
import { appleMusicCatalog } from './appleMusicCatalog';
import { getAppleMusicLyrics } from './appleMusicLyrics';

// src/services/onlineMusic/appleMusicProvider.ts
let disconnected = false;
export const appleMusicProvider: OnlineMusicProvider = {
    id: 'applemusic', displayName: 'Apple Music', shortName: 'Apple Music',
    getAvailability: () => ({ configured: Boolean(typeof window !== 'undefined' && window.electron?.appleMusicRequest) }),
    capabilities: { search: true, playback: true, lyrics: true, auth: true, userLibrary: true,
        playlists: true, albums: true, artists: false, recommendations: false, mutations: false,
        wordByWordLyrics: true, userAlbums: true },
    normalizeSong: normalizeAppleSong, normalizeCollection: normalizeAppleCollection,
    songMetadata: { getSongMetadata: createProviderSongMetadata },
    getSongPageUrl: song => song.sourceRef?.kind === 'online' && typeof song.sourceRef.providerData?.url === 'string'
        ? song.sourceRef.providerData.url || null : null,
    search: {
        async searchSongs(query, limit, offset) {
            if (!query.trim()) return { items: [], hasMore: false, nextOffset: offset };
            const response = await appleApi<{ results?: { songs?: AppleResponse } }>(`/v1/catalog/${useAppleSearchSettingsStore.getState().region.toLowerCase()}/search`, {
                term: query, alternateTerm: alternateAppleSearchQuery(query) || '', types: 'songs', limit: String(Math.min(25, limit)), offset: String(offset), include: 'albums,artists',
            });
            return applePage(response.results?.songs || {}, normalizeAppleSong, offset);
        },
    },
    playback: {
        async getSongDetail(id) {
            const library = /^[A-F0-9]{16}$/i.test(String(id)) || String(id).startsWith('i.');
            const response = await appleApi<AppleResponse>(library ? `/v1/me/library/songs/${encodeURIComponent(id)}`
                : await appleCatalogPath(`songs/${encodeURIComponent(id)}`), { include: 'albums,artists' });
            return response.data?.[0] ? normalizeAppleSong(response.data[0]) : null;
        },
        async getAudioSource(song) {
            const source = song.sourceRef;
            if (source?.kind !== 'online' || source.providerId !== 'applemusic') throw new OnlineProviderError('unsupported', 'Apple Music only', 'applemusic');
            const status = await requestAppleMusic<{ authorized: boolean; signed: boolean }>('status');
            if (!status.signed) throw new OnlineProviderError('unavailable', '请先完成 Apple Developer 签名配置。', 'applemusic');
            if (disconnected || !status.authorized) throw new OnlineProviderError('auth-required', '请先连接 Apple Music。', 'applemusic');
            // An opaque transport reference, never an audio URL or a preview asset.
            return { url: `applemusic://song/${encodeURIComponent(source.mediaId)}`, fetchedAt: Date.now(), quality: 'high' };
        },
    },
    externalPlayback: { control: (operation, params) => requestAppleMusic(operation, params), setVolume: (volume, muted) => requestAppleMusic('volume', { volume, muted }) },
    lyrics: { getLyrics: getAppleMusicLyrics },
    auth: {
        async authorize() {
            await requestAppleMusic('authorize');
            disconnected = false;
        },
        async getLoginStatus(): Promise<ProviderUser | null> {
            if (disconnected) return null;
            const status = await requestAppleMusic<{ authorized: boolean; signed: boolean }>('status');
            return status.signed && status.authorized ? { id: 'apple-music-user', nickname: 'Apple Music' } : null;
        },
        async logout() { disconnected = true; clearAppleMusicSession(); await requestAppleMusic('logout'); },
    },
    library: {
        async getUserPlaylists(_user, limit, offset) {
            const page = applePage(await appleApi<AppleResponse>('/v1/me/library/playlists', { limit: String(Math.min(100, limit)), offset: String(offset) }),
                resource => normalizeAppleCollection(resource, 'playlist'), offset);
            if (offset === 0) page.items.unshift({ providerId: 'applemusic', id: 'apple-library-songs', name: i18n.t('appleMusic.librarySongs'), type: 'playlist', isOwned: true });
            return page;
        },
        async getUserAlbums(_user, limit, offset) {
            return applePage(await appleApi<AppleResponse>('/v1/me/library/albums', { limit: String(Math.min(100, limit)), offset: String(offset) }),
                resource => normalizeAppleCollection(resource, 'album'), offset);
        },
    },
    catalog: appleMusicCatalog,
    recommendations: {
        async getRecommendedCollections(limit) {
            const response = await appleApi<{ results?: { playlists?: Array<AppleResponse> } }>(await appleCatalogPath('charts'), {
                types: 'playlists', limit: String(Math.min(25, limit)),
            });
            return (response.results?.playlists || []).flatMap(group => group.data || []).map(resource => normalizeAppleCollection(resource, 'playlist')).slice(0, limit);
        },
    },
};
