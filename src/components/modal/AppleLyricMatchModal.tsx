import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Search, Loader2 } from 'lucide-react';
import type { SongResult } from '../../types';
import { searchAppleLyricCandidates, previewAppleLyricCandidate, saveAppleLyricCandidate } from '../../services/appleMusicLyricMatching';

// src/components/modal/AppleLyricMatchModal.tsx
// Correction explicitly changes lyrics only, with preview and a persisted per-Apple-song override.
interface Props { song: SongResult; onClose: () => void; onMatch: () => void; isDaylight: boolean }
export default function AppleLyricMatchModal({ song, onClose, onMatch, isDaylight }: Props) {
    const { t } = useTranslation();
    const [query, setQuery] = useState(`${song.name} ${song.artists.map(a => a.name).join(' ')}`);
    const [results, setResults] = useState<SongResult[]>([]);
    const [selected, setSelected] = useState<SongResult | null>(null);
    const [preview, setPreview] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const generation = useRef(0);
    useEffect(() => {
        const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
        window.addEventListener('keydown', closeOnEscape);
        return () => { generation.current++; window.removeEventListener('keydown', closeOnEscape); };
    }, [onClose]);
    const search = async () => {
        const request = ++generation.current;
        setBusy(true); setError(''); setResults([]); setSelected(null); setPreview('');
        try {
            const songs = await searchAppleLyricCandidates(query);
            if (request !== generation.current) return;
            setResults(songs);
            if (!songs.length) setError(t('appleLyrics.noResults'));
        } catch (e) { if (request === generation.current) setError(e instanceof Error ? e.message : t('appleLyrics.searchFailed')); }
        finally { if (request === generation.current) setBusy(false); }
    };
    const select = async (candidate: SongResult) => {
        const request = ++generation.current;
        setSelected(candidate); setPreview(''); setError(''); setBusy(true);
        try {
            const data = await previewAppleLyricCandidate(candidate);
            if (request !== generation.current) return;
            setPreview(data.lyrics?.lines.map(line => line.fullText).join('\n') || (data.isPureMusic ? t('appleLyrics.pureMusic') : t('appleLyrics.noLyrics')));
        } catch (e) { if (request === generation.current) setError(e instanceof Error ? e.message : t('appleLyrics.loadFailed')); }
        finally { if (request === generation.current) setBusy(false); }
    };
    const save = async () => {
        if (!selected) return;
        const request = ++generation.current;
        setBusy(true); setError('');
        try { await saveAppleLyricCandidate(song, selected); if (request === generation.current) onMatch(); }
        catch (e) { if (request === generation.current) setError(e instanceof Error ? e.message : t('appleLyrics.saveFailed')); }
        finally { if (request === generation.current) setBusy(false); }
    };
    return <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-6" role="dialog" aria-modal="true" aria-label={t('appleLyrics.title')}>
        <div className={`w-full max-w-3xl rounded-2xl border p-5 shadow-2xl ${isDaylight ? 'bg-white text-zinc-900 border-black/10' : 'bg-zinc-900 text-white border-white/10'}`}>
            <div className="flex items-center justify-between mb-2"><h2 className="font-bold">{t('appleLyrics.title')}</h2><button aria-label={t('appleLyrics.close')} onClick={onClose}><X size={20} /></button></div>
            <p className="text-xs opacity-60 mb-4">{song.name} · {song.artists.map(a => a.name).join(' / ')} — {t('appleLyrics.description')}</p>
            <form className="flex gap-2 mb-3" onSubmit={e => { e.preventDefault(); void search(); }}>
                <input aria-label={t('appleLyrics.search')} className="flex-1 min-w-0 rounded-lg bg-black/10 border border-current/10 p-2 text-sm" autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder={t('appleLyrics.placeholder')} />
                <button className="rounded-lg px-4 bg-blue-500/20 disabled:opacity-40" disabled={busy || !query.trim()} type="submit"><Search size={18} /></button>
            </form>
            {error && <p role="alert" className="text-xs text-red-400 mb-3">{error}</p>}
            <div className="grid grid-cols-2 gap-4 h-[45vh] min-h-48">
                <div className="overflow-y-auto space-y-2" aria-label={t('appleLyrics.candidates')}>{results.map(candidate => <button key={String(candidate.id)} disabled={busy} onClick={() => void select(candidate)} className={`block w-full text-left p-3 rounded-lg border ${selected?.id === candidate.id ? 'border-blue-500 bg-blue-500/15' : 'border-current/10 bg-black/5'}`}>
                    <span className="block text-sm">{candidate.name}</span><span className="block text-xs opacity-60">{candidate.artists.map(a => a.name).join(' / ')}</span>
                    <span className="block text-xs opacity-50">{candidate.album.name} · {Math.floor(candidate.durationMs / 60000)}:{String(Math.floor(candidate.durationMs / 1000) % 60).padStart(2, '0')}</span>
                </button>)}</div>
                <pre className="overflow-y-auto whitespace-pre-wrap text-sm leading-7 opacity-75 bg-black/5 rounded-lg p-3" aria-label={t('appleLyrics.preview')}>{busy ? t('appleLyrics.loading') : preview || t('appleLyrics.choose')}</pre>
            </div>
            <div className="flex items-center justify-end gap-3 mt-4">{busy && <Loader2 className="animate-spin" size={16} />}<button className="px-4 py-2 rounded-lg bg-blue-500/25 disabled:opacity-30" disabled={!selected || busy} onClick={() => void save()}>{t('appleLyrics.save')}</button></div>
        </div>
    </div>;
}
