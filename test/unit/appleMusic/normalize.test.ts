import { describe, expect, it } from 'vitest';
import { normalizeAppleSong, normalizeAppleCollection, applePage } from '../../../src/services/onlineMusic/appleMusicNormalize';
import { appleMusicSourceId, isAppleMusicSource } from '../../../src/utils/appleMusicSource';

// test/unit/appleMusic/normalize.test.ts
const resource = { id: 'AF12345678901234', type: 'library-songs', attributes: {
    name: 'Song', artistName: 'Artist', albumName: 'Album', durationInMillis: 234000,
    artwork: { url: 'https://is1-ssl.mzstatic.com/image/{w}x{h}bb.{f}' },
    playParams: { catalogId: '1234567' }, isrc: 'US1234567890',
} };
describe('Apple Music source identity and pagination', () => {
    it('retains the library identity independently from its catalog equivalent', () => {
        const song = normalizeAppleSong(resource);
        expect(song.id).toBe('AF12345678901234');
        expect(song.sourceRef).toMatchObject({ kind: 'online', providerId: 'applemusic', mediaId: resource.id,
            providerData: { catalogId: '1234567', isrc: 'US1234567890' } });
        expect(song.durationMs).toBe(234000);
        expect(song.album.coverUrl).toContain('1200x1200bb.jpg');
    });
    it('never invents a numeric album or artist catalog reference', () => {
        const song = normalizeAppleSong(resource);
        expect(song.album.catalogRef).toBeUndefined();
        expect(song.artists[0].catalogRef).toBeUndefined();
    });
    it('uses next rather than a short page as the pagination signal', () => {
        expect(applePage({ data: [resource], next: '/next' }, normalizeAppleSong, 50)).toMatchObject({ hasMore: true, nextOffset: 51 });
        expect(applePage({ data: [resource] }, normalizeAppleSong, 50).hasMore).toBe(false);
    });
    it('recognizes a library playlist as owned and preserves its type', () => {
        expect(normalizeAppleCollection({ ...resource, type: 'library-playlists' })).toMatchObject({ providerId: 'applemusic', type: 'playlist', isOwned: true });
    });
    it('round trips opaque references and rejects network and malformed references', () => {
        const source = 'applemusic://song/catalog%3A123';
        expect(isAppleMusicSource(source)).toBe(true);
        expect(appleMusicSourceId(source)).toBe('catalog:123');
        expect(isAppleMusicSource('https://example.com/preview.m4a')).toBe(false);
        expect(isAppleMusicSource('applemusic://song/123/extra')).toBe(false);
        expect(() => appleMusicSourceId('javascript:alert(1)')).toThrow();
    });
});
