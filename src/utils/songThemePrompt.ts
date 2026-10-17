import type { LyricData, SongResult } from '../types';
import { isPureMusicLyricText } from './lyrics/pureMusic';

// src/utils/songThemePrompt.ts
// Missing lyrics are metadata mode, never an assertion that a song is instrumental.
export function buildSongThemePrompt(song: SongResult | null, lyrics: LyricData | null) {
    const text = lyrics?.lines.map(line => line.fullText).join('\n').trim() || '';
    const songTitle = song?.name?.trim() || lyrics?.title?.trim() || '';
    const isPureMusic = Boolean(song?.isPureMusic) || isPureMusicLyricText(text);
    const metadataOnly = !text && !isPureMusic;
    const metadata = [songTitle, song?.artists.map(a => a.name).join(', '), song?.album.name].filter(Boolean).join(' / ');
    const promptText = metadataOnly && metadata
        ? `Song metadata only (no lyrics available). Infer a visual mood from the title, artist and album; do not invent lyrics.\n${metadata}`
        : (isPureMusic ? songTitle : text) || text;
    return { promptText, songTitle, isPureMusic, metadataOnly };
}
