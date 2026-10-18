import AppleLyricRecoveryStatus from './AppleLyricRecoveryStatus';
import { useAppleLyricEditorStore } from '../../stores/useAppleLyricEditorStore';
import AppleLyricTimingEditor from './AppleLyricTimingEditor';
import { usePlaybackStore } from '../../stores/usePlaybackStore';
import React, { useMemo, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FileText, Search, RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { OnlineLyricsState, ReplayGainMode, SongResult } from '../../types';
import LyricTimelineOffsetControl from './LyricTimelineOffsetControl';
import LyricFileButton from './LyricFileButton';
import ReplayGainControl from './ReplayGainControl';
import { getLyricProviderLabel, getSongNativeLyricProviderSource } from '../../utils/lyrics/lyricSourceLabels';
import { readLyricFile } from '../../utils/lyrics/lyricFileDecoding';

// src/components/panelTab/OnlineLyricsTab.tsx

interface OnlineLyricsTabProps {
    song: SongResult;
    onlineLyricsState: OnlineLyricsState | null;
    onImportLyrics: (content: string, fileName: string) => void;
    onChangeLyricsSource: (source: 'online' | 'imported') => void;
    onMatchOnlineLyrics: () => void;
    onClearOnlineLyricsState: () => void;
    lyricTimelineOffsetMs: number;
    onLyricTimelineOffsetChange: (offsetMs: number) => void;
    replayGainMode: ReplayGainMode;
    onChangeReplayGainMode: (mode: ReplayGainMode) => void;
    isDaylight: boolean;
}

const OnlineLyricsTab: React.FC<OnlineLyricsTabProps> = ({
    song,
    onlineLyricsState,
    onImportLyrics,
    onChangeLyricsSource,
    onMatchOnlineLyrics,
    onClearOnlineLyricsState,
    lyricTimelineOffsetMs,
    onLyricTimelineOffsetChange,
    replayGainMode,
    onChangeReplayGainMode,
    isDaylight,
}) => {
    const { t } = useTranslation();
    const expanded = useAppleLyricEditorStore(state => state.expanded);
    const currentOrigin = usePlaybackStore(state => state.lyrics?.appleLyricsOrigin);

    const activeTabBg = isDaylight ? 'bg-blue-500/15 text-blue-600' : 'bg-blue-500/20 text-blue-300';
    const tabContainerBg = isDaylight ? 'bg-black/5' : 'bg-white/5';
    const activePillBg = isDaylight ? 'bg-white shadow-[0_2px_8px_rgba(0,0,0,0.06)]' : 'bg-zinc-800/80 shadow-[0_2px_8px_rgba(0,0,0,0.2)]';
    const activeTextColor = isDaylight ? 'text-blue-600 font-semibold' : 'text-blue-300 font-semibold';
    const inactiveTextColor = isDaylight ? 'text-zinc-500 hover:text-zinc-800' : 'text-zinc-400 hover:text-zinc-200';

    const hasImportedLyrics = Boolean(onlineLyricsState?.importedLyrics);
    const hasOverride = Boolean(onlineLyricsState?.hasOnlineOverride || onlineLyricsState?.importedLyrics);
    const activeSource = onlineLyricsState?.lyricsSource === 'imported' && hasImportedLyrics ? 'imported' : 'online';

    const onlineSourceLabel = useMemo(() => {
        if (song.sourceRef?.kind === 'online' && song.sourceRef.providerId === 'applemusic') return currentOrigin === 'apple-library' ? t('appleTiming.appleSource') : currentOrigin === 'lrclib' ? 'LRCLIB' : t(`lyricProvider.${currentOrigin === 'qq' || currentOrigin === 'kugou' ? currentOrigin : 'netease'}`);
        return getLyricProviderLabel(
            onlineLyricsState?.matchedLyricsSource ?? getSongNativeLyricProviderSource(song),
            onlineLyricsState?.matchedLyricsProviderPlatform,
        );
    }, [onlineLyricsState, song, t, currentOrigin]);

    const availableSources = useMemo(
        () => (hasImportedLyrics
            ? [
                { key: 'online' as const, label: onlineSourceLabel },
                { key: 'imported' as const, label: t('localMusic.statusImported') },
            ]
            : [{ key: 'online' as const, label: onlineSourceLabel }]),
        [hasImportedLyrics, onlineSourceLabel, t],
    );

    const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) {
            return;
        }

        void readLyricFile(file).then((content) => {
            if (content) {
                onImportLyrics(content, file.name);
            }
        }).catch((error) => {
            console.error(`[OnlineLyricsTab] Failed to read lyric file ${file.name}`, error);
        });
        event.target.value = '';
    };

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col gap-4 pt-0 px-2"
        >
            {song.sourceRef?.kind === 'online' && song.sourceRef.providerId === 'applemusic' && <details open={expanded}
                onToggle={event => useAppleLyricEditorStore.setState({ expanded: event.currentTarget.open })} className="rounded-lg border border-current/10 p-3">
                <summary className="cursor-pointer text-xs font-semibold">{t('appleTiming.title')}</summary>
                {expanded && <div className="mt-3"><AppleLyricTimingEditor key={String(song.sourceRef.mediaId)} song={song} onSaved={() => onChangeLyricsSource('imported')} /></div>}
            </details>}
            {song.sourceRef?.kind === 'online' && song.sourceRef.providerId === 'applemusic' && <AppleLyricRecoveryStatus
                key={String(song.sourceRef.mediaId)} song={song} onSaved={onChangeLyricsSource} />}
            <ReplayGainControl
                values={song.replayGain}
                mode={replayGainMode}
                onChangeMode={onChangeReplayGainMode}
                isDaylight={isDaylight}
            />

            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                        <label className="text-[12px] font-bold opacity-40 uppercase tracking-widest flex items-center gap-1.5">
                            {t('localMusic.lyrics')}
                        </label>
                        {hasOverride && (
                            <button
                                onClick={onClearOnlineLyricsState}
                                className={`p-1 rounded-md transition-all opacity-40 hover:opacity-100 ${isDaylight ? 'hover:bg-black/5' : 'hover:bg-white/5'}`}
                                title={t('localMusic.delete')}
                            >
                                <RotateCcw size={13} />
                            </button>
                        )}
                    </div>
                    <div className="flex items-center gap-1">
                        <LyricFileButton
                            isDaylight={isDaylight}
                            onImportChange={handleImport}
                            buttonClassName={`p-1 rounded-md transition-all opacity-40 hover:opacity-100 ${isDaylight ? 'hover:bg-black/5' : 'hover:bg-white/5'}`}
                        />
                        <button
                            onClick={onMatchOnlineLyrics}
                            className={`p-1 rounded-md transition-all opacity-40 hover:opacity-100 ${isDaylight ? 'hover:bg-black/5' : 'hover:bg-white/5'}`}
                            title={t('localMusic.matchOnline')}
                        >
                            <Search size={14} />
                        </button>
                    </div>
                </div>

                {availableSources.length === 1 ? (
                    <div className={`flex items-center justify-between ${isDaylight ? 'bg-black/5' : 'bg-white/5'} rounded-lg p-2 pl-3`}>
                        <span className="text-[11px] opacity-60">
                            {t('localMusic.lyricsSource')}
                        </span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${activeTabBg}`}>
                            {availableSources[0].label}
                        </span>
                    </div>
                ) : (
                    <div className={`relative flex p-0.5 ${tabContainerBg} rounded-lg`}>
                        {availableSources.map(source => {
                            const isActive = activeSource === source.key;
                            return (
                                <button
                                    key={source.key}
                                    onClick={() => onChangeLyricsSource(source.key)}
                                    className={`flex-1 relative text-[10px] py-1 px-1.5 rounded-md font-medium transition-colors duration-200 focus:outline-none ${
                                        isActive ? activeTextColor : inactiveTextColor
                                    }`}
                                >
                                    {isActive && (
                                        <motion.span
                                            layoutId="online-lyrics-active-pill"
                                            className={`absolute inset-0 rounded-md ${activePillBg}`}
                                            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                                        />
                                    )}
                                    <span className="relative z-10">{source.label}</span>
                                </button>
                            );
                        })}
                    </div>
                )}

                <LyricTimelineOffsetControl
                    offsetMs={lyricTimelineOffsetMs}
                    onOffsetChange={onLyricTimelineOffsetChange}
                    isDaylight={isDaylight}
                />
            </div>
        </motion.div>
    );
};

export default OnlineLyricsTab;
