import type { CommandPaletteSurface } from './types';

// src/components/command-palette/surfaces/appleSearchRegionSurface.ts
export const appleSearchRegionSurface: CommandPaletteSurface = {
    load: () => import('./AppleSearchRegionSurfaceView'),
    mapProps: ({ context, close }) => ({
        onApply: async () => {
            close();
            const { useSearchNavigationStore } = await import('../../../stores/useSearchNavigationStore');
            const state = useSearchNavigationStore.getState();
            if (state.isSearchOpen && state.searchQuery.trim()) {
                await context.search.submitSearch({
                    query: state.searchQuery, sourceTab: 'applemusic', returnView: state.searchReturnView,
                    deps: { localSongs: context.search.localSongs, localLibraryCatalog: context.search.localLibraryCatalog, t: context.shared.t },
                });
            }
        },
    }),
};
