import { useAppleLyricEditorStore } from '../../../stores/useAppleLyricEditorStore';
import { defineCommand } from '../commandFactories';
import { ListMusic } from 'lucide-react';
import type { CommandPaletteCommand } from '../types';
import { createPanelCommand } from '../commandFactories';

// src/components/command-palette/commands/panelCommands.ts
// Commands in the `panel` group: opening the unified side panel on a given tab.

export const panelCommands: CommandPaletteCommand[] = [
    defineCommand({
        id: 'apple-lyric-timing', group: 'panel', scope: 'player-surface', title: 'Sentence timing', description: 'Read, import and synchronize lyrics for the current Apple Music song',
        keywords: ['timestamp', 'tap lyrics', '逐句打点', '歌词时间轴', '简介歌词'],
        isAvailable: context => !context || (context.shared.currentSong?.sourceRef?.kind === 'online' && context.shared.currentSong.sourceRef.providerId === 'applemusic'),
        execute: (_input, context) => {
            useAppleLyricEditorStore.setState({ expanded: true });
            context.panel.setPanelTab('onlineLyrics'); context.panel.setIsPanelOpen(true); return true;
        },
    }),
    createPanelCommand('cover', 'Panel: cover', 'Open the cover panel tab', ['cover panel', '封面'], undefined, { executeShortcut: 'c' }),
    createPanelCommand('controls', 'Panel: controls', 'Open the controls panel tab', ['controls panel', '控制']),
    createPanelCommand('queue', 'Panel: queue', 'Open the queue panel tab', ['queue panel', '队列'], ListMusic),
    createPanelCommand('account', 'Panel: account', 'Open the account panel tab', ['account panel', '账号', '账户']),
    createPanelCommand('local', 'Panel: local', 'Open the local panel tab', ['local panel', '本地面板']),
    createPanelCommand('navi', 'Panel: Navidrome', 'Open the Navidrome panel tab', ['panel navi', 'navi panel', 'navidrome 面板', '服务器面板']),
    createPanelCommand('onlineLyrics', 'Panel: lyrics', 'Open the online lyrics panel tab', ['lyrics panel', '歌词面板']),
];
