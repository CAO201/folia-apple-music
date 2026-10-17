import React from 'react';
import { createRoot } from 'react-dom/client';
import AppleLyricMatchModal from '../../src/components/modal/AppleLyricMatchModal';
import { loadOnlineLyricsState } from '../../src/utils/onlineLyricsState';
import { getAppleMusicLyrics } from '../../src/services/onlineMusic/appleMusicLyrics';

// test/manual/appleMusicImprovementsProbe.tsx
// Run only in an isolated desktop driver profile; no playback operation is invoked.
export async function mountAppleLyricProbe() {
    const response = await window.electron!.neteaseLyricsRequest!('search', { keywords: '陈奕迅 富士山下' });
    const candidate = response.data.songs.find((song: any) => song.name === '富士山下' && song.artists.some((a: any) => a.name === '陈奕迅'));
    if (!candidate) throw new Error('Expected original recording');
    const song = { ...candidate, id: 'APPLE-TEST-ONLY', name: 'Under Mount Fuji', artists: [{ id: 'eason', name: 'Eason Chan' }],
        sourceRef: { kind: 'online' as const, providerId: 'applemusic' as const, mediaId: 'APPLE-TEST-ONLY' } };
    const automatic = await getAppleMusicLyrics(song);
    if (!automatic.lyrics?.lines.length) throw new Error('English title auto-match failed');
    const host = document.createElement('div'); document.body.appendChild(host);
    const root = createRoot(host);
    (window as any).__appleLyricProbe = { automatic: true, wordByWord: automatic.lyrics.isWordByWord, song, done: false };
    root.render(<AppleLyricMatchModal song={song} isDaylight={false} onClose={() => root.unmount()} onMatch={() => {
        void loadOnlineLyricsState(song).then(state => { (window as any).__appleLyricProbe.saved = Boolean(state?.hasOnlineOverride && state?.matchedSongId); (window as any).__appleLyricProbe.done = true; });
    }} />);
    return { automatic: true, lines: automatic.lyrics.lines.length, expectedId: candidate.id };
}
