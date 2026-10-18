import React from 'react';
import { useTranslation } from 'react-i18next';
import type { SongResult } from '../../types';
import { useAppleLyricTiming } from '../../hooks/useAppleLyricTiming';
import { readLyricFile } from '../../utils/lyrics/lyricFileDecoding';

// src/components/panelTab/AppleLyricTimingEditor.tsx
export default function AppleLyricTimingEditor({ song, onSaved, seed = '' }: {
    song: SongResult; onSaved: () => void | Promise<void>; seed?: string;
}) {
    const { t } = useTranslation();
    const editor = useAppleLyricTiming(song, onSaved, seed);
    const button = 'rounded-lg border border-current/20 px-3 py-2 text-xs disabled:opacity-40';
    return <section className="space-y-3 text-sm" data-testid="apple-lyric-timing" tabIndex={0} onKeyDown={event => {
        const target = event.target as HTMLElement;
        if (event.code === 'Space' && target.tagName === 'BUTTON') event.stopPropagation();
        if (event.code === 'Space' && (target === event.currentTarget || target.dataset.lyricTap === 'true')) {
            event.preventDefault(); event.stopPropagation(); if (!event.repeat) void editor.tap();
        }
    }}>
        <p className="text-xs leading-5 opacity-70">{t('appleTiming.instructions')}</p>
        <div className="flex flex-wrap gap-2">
            <button type="button" className={button} disabled={editor.busy || !editor.ready} onClick={() => void editor.loadApple()}>{t('appleTiming.readApple')}</button>
            <label className={button}>{t('appleTiming.importFile')}<input type="file" className="sr-only" accept=".lrc,.ttml,.vtt,.yrc,.txt" disabled={editor.busy || !editor.ready} onChange={event => {
                const file = event.target.files?.[0]; event.target.value = '';
                if (file && file.size > 2 * 1024 * 1024) { editor.reportFileError(); return; }
                if (file) void readLyricFile(file).then(content => editor.importText(content)).catch(() => editor.reportFileError());
            }} /></label>
        </div>
        <textarea aria-label={t('appleTiming.text')} placeholder={t('appleTiming.placeholder')} value={editor.text} disabled={editor.busy || !editor.ready}
            onChange={event => editor.changeText(event.target.value)} rows={5} className="w-full rounded-lg border border-current/20 bg-transparent p-3 text-sm" />
        <div className="flex flex-wrap gap-2">
            <button type="button" className={button} disabled={editor.busy || !editor.rows.length || editor.times.length >= editor.rows.length} data-lyric-tap="true" onClick={() => void editor.tap()}>{t('appleTiming.tap')} ({editor.times.length}/{editor.rows.length})</button>
            <button type="button" className={button} disabled={editor.busy || !editor.times.length} onClick={editor.undo}>{t('appleTiming.undo')}</button>
            <button type="button" className={button} disabled={editor.busy || !editor.text.trim()} onClick={editor.useTimestamps}>{t('appleTiming.useTimestamps')}</button>
            <button type="button" className={button} disabled={editor.busy || !editor.text.trim()} onClick={editor.align}>{t('appleTiming.align')}</button>
            <button type="button" className={button} disabled={editor.busy || !editor.rows.length || editor.times.length !== editor.rows.length} onClick={() => void editor.save()}>{t('appleTiming.save')}</button>
        </div>
        <div className="max-h-48 space-y-1 overflow-y-auto" aria-label={t('appleTiming.timeline')}>
            {editor.rows.map((row, i) => <div key={i} className={`flex items-center gap-2 rounded px-2 py-1 ${i === editor.times.length ? 'bg-blue-500/20' : ''}`}>
                <span className="min-w-0 flex-1 text-xs">{i + 1}. {row}</span>
                {i < editor.times.length ? <>
                    <input aria-label={t('appleTiming.time', { line: i + 1 })} type="number" step="0.01" min="0" max={song.durationMs / 1000}
                        className="w-20 rounded border border-current/20 bg-transparent px-1 text-xs" value={Number.isFinite(editor.times[i]) ? Number(editor.times[i].toFixed(2)) : ''}
                        onChange={event => editor.editTime(i, event.target.value === '' ? NaN : Number(event.target.value))} disabled={editor.busy} />
                    <button type="button" className="text-xs underline" disabled={editor.busy} onClick={() => void editor.audition(i)}>{t('appleTiming.audition')}</button>
                </> : <span className="text-xs opacity-40">{t('appleTiming.pending')}</span>}
            </div>)}
        </div>
        {editor.feedback && <p role="status" className="text-xs leading-5">{t(editor.feedback, { defaultValue: editor.feedback })}</p>}
    </section>;
}
