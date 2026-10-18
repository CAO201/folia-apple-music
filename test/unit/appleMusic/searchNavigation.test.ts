import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppleSearchSettingsStore as settings } from '../../../src/stores/useAppleSearchSettingsStore';
import { useSearchNavigationStore as navigation } from '../../../src/stores/useSearchNavigationStore';
import { omni } from '../../../src/services/onlineMusic/omni';

// test/unit/appleMusic/searchNavigation.test.ts
vi.mock('../../../src/services/onlineMusic/omni', () => ({ omni: { searchProviderSongs: vi.fn() } }));
const deps = { localSongs: [], t: (key: string) => key };
describe('Apple storefront navigation', () => {
    beforeEach(() => {
        settings.setState({ region: 'CN', confirmed: false });
        navigation.getState().resetRuntime('applemusic');
        navigation.setState({ searchCache: {} });
        vi.mocked(omni.searchProviderSongs).mockReset();
    });
    it('opens a default CN confirmation before the first request', async () => {
        await navigation.getState().submitSearch({ query: 'Song', sourceTab: 'netease', deps });
        expect(navigation.getState()).toMatchObject({ isSearchOpen: true, isSearching: false, searchSourceTab: 'applemusic' });
        expect(omni.searchProviderSongs).not.toHaveBeenCalled();
    });
    it('prevents a late CN response from overwriting a TR query', async () => {
        settings.getState().setRegion('CN');
        let finish!: (value: any) => void;
        vi.mocked(omni.searchProviderSongs).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
        const previous = navigation.getState().submitSearch({ query: 'Song', sourceTab: 'applemusic', deps });
        settings.getState().setRegion('TR');
        vi.mocked(omni.searchProviderSongs).mockResolvedValueOnce({ items: [], hasMore: false, nextOffset: 0, warning: 'TR result' });
        await navigation.getState().submitSearch({ query: 'Song', sourceTab: 'applemusic', deps });
        finish({ items: [{ id: 'CN' }], hasMore: true, nextOffset: 1 });
        await previous;
        expect(navigation.getState().searchResults).toEqual([]);
        expect(navigation.getState().searchError).toBe('TR result');
        expect(Object.keys(navigation.getState().searchCache)).toEqual(['applemusic:TR:song']);
        navigation.getState().restoreSearch({ query: 'Song', sourceTab: 'applemusic' });
        expect(navigation.getState().searchError).toBe('TR result');
    });
    it('discards an in-flight next page when changing region', async () => {
        settings.getState().setRegion('CN');
        navigation.setState({ searchQuery: 'Song', searchResults: [], hasMore: true, offset: 25 });
        let finish!: (value: any) => void;
        vi.mocked(omni.searchProviderSongs).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
        const previous = navigation.getState().loadMoreSearchResults({ deps });
        settings.getState().setRegion('TR');
        finish({ items: [{ id: 'CN page 2' }], hasMore: false, nextOffset: 26 });
        await previous;
        expect(navigation.getState()).toMatchObject({ searchResults: null, isLoadingMore: false, offset: 0 });
    });
});
