import type { SongResult } from '../../types';
import { calculateMatchScoreDetails, normalizeLyricMatchText } from '../../utils/lyrics/matchScore';

// src/services/onlineMusic/appleNeteaseLyricMatch.ts
// Apple sometimes localizes Chinese artist names to English; use aliases only for lyric identity matching.
const ARTIST_ALIASES: Record<string, string> = {
    jaychou: '周杰伦', fayewong: '王菲', jokerxue: '薛之谦', yanzisun: '孙燕姿', jjlin: '林俊杰',
    gem: '邓紫棋', leizhao: '赵雷', easonchan: '陈奕迅', joeyyung: '容祖儿', fishleong: '梁静茹', jolintsai: '蔡依林', jolin: '蔡依林', mayday: '五月天',
    davidtao: '陶喆', wangleehom: '王力宏', leehomwang: '王力宏', stefaniesun: '孙燕姿',
    jackycheung: '张学友', lesliecheung: '张国荣', andylau: '刘德华', karenmok: '莫文蔚',
    sandylam: '林忆莲', alin: '黄丽玲', amei: '张惠妹',
};
export const neteaseLyricArtist = (name: string): string => ARTIST_ALIASES[normalizeLyricMatchText(name).replace(/\s+/g, '')] || (/\p{Script=Han}/u.test(name) ? normalizeLyricMatchText(name) : name);
const TITLE_ALIASES: Record<string, Record<string, string>> = {
    '周杰伦': {
        adandelionspromise: '蒲公英的约定', inthenameofthefather: '以父之名', fearless: '霍元甲',
        sunnyday: '晴天', nocturne: '夜曲', commonjasmineorange: '七里香',
        loveconfession: '告白气球', blueandwhiteporcelain: '青花瓷', simplelove: '简单爱',
        sweetly: '甜甜的', sweet: '甜甜的', rainbow: '彩虹', silence: '安静',
    },
    '王菲': { fleetoftime: '匆匆那年', fleetingyears: '流年', redbean: '红豆' },
    '孙燕姿': { encounter: '遇见' },
    '陈奕迅': { underthemountfuji: '富士山下', undermountfuji: '富士山下', tenyears: '十年' },
};
const compact = (text: string) => normalizeLyricMatchText(text).replace(/\s+/g, '');
export function neteaseLyricTitle(song: SongResult): string {
    for (const artist of song.artists) {
        const alias = TITLE_ALIASES[neteaseLyricArtist(artist.name)]?.[compact(song.name)];
        if (alias) return alias;
    }
    return song.name;
}
export function appleLyricSearchQueries(song: SongResult): string[] {
    const artist = song.artists.map(a => neteaseLyricArtist(a.name)).join(' ');
    const title = neteaseLyricTitle(song);
    return [...new Set([`${title} ${artist}`.trim(), title, `${artist} ${song.album.name}`.trim()])].filter(Boolean);
}
export function appleLyricMatchScore(target: SongResult, candidate: SongResult) {
    return calculateMatchScoreDetails({ title: neteaseLyricTitle(target), artist: target.artists.map(a => neteaseLyricArtist(a.name)).join(', '),
        durationMs: target.durationMs, album: target.album.name }, { ...candidate, name: neteaseLyricTitle(candidate),
        artists: candidate.artists.map(a => ({ ...a, name: neteaseLyricArtist(a.name) })) });
}
export function selectAppleNeteaseLyricSong(target: SongResult, candidates: SongResult[]): SongResult | null {
    const normalizedTitle = (text: string) => normalizeLyricMatchText(text).replace(/\s+/g, '');
    if (!target.artists.some(artist => artist.name.trim())) return null;
    return candidates.map(song => ({ song, score: appleLyricMatchScore(target, song) }))
        .filter(({ song, score }) => normalizedTitle(neteaseLyricTitle(song)) === normalizedTitle(neteaseLyricTitle(target))
            && song.artists.some(artist => artist.name.trim()) && score.artistSimilarity >= 0.7 && target.durationMs > 0 && song.durationMs > 0 && Math.abs(song.durationMs - target.durationMs) <= 4000)
        .sort((a, b) => b.score.score - a.score.score
            || Math.abs(a.song.durationMs - target.durationMs) - Math.abs(b.song.durationMs - target.durationMs))[0]?.song || null;
}
