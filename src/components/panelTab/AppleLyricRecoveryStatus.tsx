import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SongResult } from '../../types';
import { omni } from '../../services/onlineMusic/omni';
import { saveAppleTimedLyrics } from '../../services/appleMusicLyricTiming';
import { useAppleLyricRecoveryStore } from '../../stores/useAppleLyricRecoveryStore';
import { usePlaybackStore } from '../../stores/usePlaybackStore';
import { getPlaybackSongKey, isSamePlaybackSong } from '../../utils/appPlaybackGuards';
import type { FallbackLyricCandidate } from '../../types/onlineMusic';

// src/components/panelTab/AppleLyricRecoveryStatus.tsx
export default function AppleLyricRecoveryStatus({ song, onSaved }: { song: SongResult; onSaved: (source: 'online' | 'imported') => void }) {
    const { t } = useTranslation();
    const recovery = useAppleLyricRecoveryStore();
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('');
    const controller = useRef<AbortController | null>(null);
    useEffect(() => () => controller.current?.abort(), []);
    const key = getPlaybackSongKey(song);
    const active = recovery.key === key;
    const run = async (candidate?: FallbackLyricCandidate) => {
        if (busy) return;
        controller.current?.abort();
        const abort = new AbortController(); controller.current = abort;
        setBusy(true); setMessage('');
        try {
            if (candidate) {
                const result = await omni.getCandidateLyrics(song, candidate, abort.signal);
                if (!result.lyrics) throw new Error('appleRecovery.noTimedCandidate');
                if (abort.signal.aborted || !isSamePlaybackSong(usePlaybackStore.getState().currentSong, song)) return;
                await saveAppleTimedLyrics(song, result.lyrics, `${candidate.source} · ${candidate.song.name}`);
                if (!abort.signal.aborted && isSamePlaybackSong(usePlaybackStore.getState().currentSong, song)) onSaved('imported');
            } else {
                useAppleLyricRecoveryStore.setState({ key, phase: 'searching', candidates: [] });
                const result = await omni.recoverLyrics(song, { signal: abort.signal, force: true });
                if (abort.signal.aborted || !isSamePlaybackSong(usePlaybackStore.getState().currentSong, song)) return;
                useAppleLyricRecoveryStore.setState({ key, phase: result.lyrics ? 'found' : 'missing', candidates: result.candidates || [] });
                if (result.lyrics) onSaved('online');
            }
        } catch (error) {
            if (!abort.signal.aborted) {
                setMessage(error instanceof Error ? error.message : 'appleRecovery.failed');
                if (!candidate) useAppleLyricRecoveryStore.setState({ key, phase: 'missing', candidates: [] });
            }
        } finally { if (!abort.signal.aborted) setBusy(false); }
    };
    return <section className="space-y-2 rounded-lg border border-current/10 p-3 text-xs" aria-label={t('appleRecovery.title')}>
        <div className="flex items-center justify-between gap-2">
            <span>{t(`appleRecovery.${active ? recovery.phase : 'idle'}`)}</span>
            <button type="button" className="shrink-0 rounded border border-current/20 px-2 py-1 disabled:opacity-40"
                disabled={busy || (active && recovery.phase === 'searching')} onClick={() => void run()}>{t('appleRecovery.retry')}</button>
        </div>
        {active && recovery.phase === 'missing' && recovery.candidates.length > 0 && <>
            <p className="opacity-60">{t('appleRecovery.choose')}</p>
            {recovery.candidates.map(candidate => <button type="button" disabled={busy} key={`${candidate.source}:${candidate.song.id}`}
                className="block w-full rounded border border-current/10 p-2 text-left disabled:opacity-40" onClick={() => void run(candidate)}>
                {candidate.song.name} · {candidate.song.artists.map(a => a.name).join(', ')} · {candidate.source}<br />
                <span className="opacity-60">{candidate.song.album.name} · {Math.round(candidate.song.durationMs / 1000)}s</span>
            </button>)}
        </>}
        {message && <p role="status">{t(message, { defaultValue: t('appleRecovery.failed') })}</p>}
    </section>;
}
