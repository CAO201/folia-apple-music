import type { SongResult } from '../../types';
import { normalizeLyricMatchText } from '../../utils/lyrics/matchScore';
import { searchAmllDbSongs } from '../../utils/lyrics/providers/amllDbProvider';
import { getAmllApiData, type AmllApiSongItem } from '../../utils/lyrics/providers/amllApi';
import { parseLyricsByFormat } from '../../utils/lyrics/parserCore';

// src/services/onlineMusic/appleMusicTtml.ts
// Query the existing community lyrics service directly; no legacy platform is used for playback.
const normalized = (text: string) => normalizeLyricMatchText(text).replace(/\s+/g, '');
export function isAppleLyricCandidate(song: SongResult, candidate: AmllApiSongItem): boolean {
    const title = normalized(song.name);
    return candidate.musicNames.some(name => normalized(name) === title)
        && song.artists.length > 0
        && song.artists.every(artist => candidate.artistNames.some(name => normalized(name) === normalized(artist.name)));
}
export async function getAppleMusicTtml(song: SongResult) {
    try {
        const source = song.sourceRef;
        const catalogId = source?.kind === 'online'
            ? String(source.providerData?.catalogId || (source.mediaId.startsWith('catalog:') ? source.mediaId.slice(8) : '')) : '';
        let item: AmllApiSongItem | null = null;
        if (catalogId) item = await getAmllApiData<AmllApiSongItem>(`https://api.amll.dev/v1/lyrics/get?appleMusicId=${encodeURIComponent(catalogId)}`);
        if (!item) {
            const matches = (await searchAmllDbSongs({ musicName: song.name.replace(/\s+/g, ' ').trim(), artistName: song.artists[0]?.name }, 10) || [])
                .filter(candidate => isAppleLyricCandidate(song, candidate));
            const exactAlbum = matches.filter(candidate => candidate.albumNames.some(album => normalized(album) === normalized(song.album.name)));
            const candidates = exactAlbum.length ? exactAlbum : matches;
            if (candidates.length !== 1) return null;
            item = await getAmllApiData<AmllApiSongItem>(`https://api.amll.dev/v1/lyrics/get?id=${candidates[0].id}`);
        }
        if (!item?.lyrics || !isAppleLyricCandidate(song, item)) return null;
        const lyrics = parseLyricsByFormat('ttml', item.lyrics);
        if (!lyrics?.lines.length) return null;
        const end = Math.max(...lyrics.lines.map(line => line.endTime));
        if (song.durationMs > 0 && end > song.durationMs / 1000 + 3) return null;
        return { lyrics, wordByWordText: item.lyrics, isPureMusic: false };
    } catch { return null; }
}
