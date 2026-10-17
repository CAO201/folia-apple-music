import { describe, expect, it, vi } from 'vitest';
vi.mock('../../../src/utils/lyrics/providers/amllDbProvider', () => ({ searchAmllDbSongs: vi.fn() }));
vi.mock('../../../src/utils/lyrics/providers/amllApi', () => ({ getAmllApiData: vi.fn() }));
import { isAppleLyricCandidate, getAppleMusicTtml } from '../../../src/services/onlineMusic/appleMusicTtml';
import { searchAmllDbSongs } from '../../../src/utils/lyrics/providers/amllDbProvider';
import { getAmllApiData } from '../../../src/utils/lyrics/providers/amllApi';
import type { SongResult } from '../../../src/types';
import type { AmllApiSongItem } from '../../../src/utils/lyrics/providers/amllApi';

// test/unit/appleMusic/lyrics.test.ts
const song: SongResult = { id: 'ABC', name: '两 难', artists: [{ id: 'artist', name: '加木' }], album: { id: 'a', name: '加木' }, durationMs: 170000,
    sourceRef: { kind: 'online', providerId: 'applemusic', mediaId: 'ABC' } };
const candidate = { id: 1, musicNames: ['两难'], artistNames: ['加木'], albumNames: ['加木'] } as AmllApiSongItem;
describe('Apple Music community lyric matching', () => {
    it('normalizes spacing but rejects a different singer or live version', () => {
        expect(isAppleLyricCandidate(song, candidate)).toBe(true);
        expect(isAppleLyricCandidate(song, { ...candidate, artistNames: ['Other'] })).toBe(false);
        expect(isAppleLyricCandidate(song, { ...candidate, musicNames: ['两难 (Live)'] })).toBe(false);
    });
    it('does not silently pick among ambiguous exact metadata matches', async () => {
        vi.mocked(searchAmllDbSongs).mockResolvedValue([candidate, { ...candidate, id: 2 }]);
        expect(await getAppleMusicTtml(song)).toBeNull();
        expect(getAmllApiData).not.toHaveBeenCalled();
    });
});
