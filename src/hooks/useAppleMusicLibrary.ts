import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import { createAppleMusicStartupConnection } from '../services/appleMusicStartup';
import { omni } from '../services/onlineMusic/omni';
import { useOnlineProviderAccountStore } from '../stores/useOnlineProviderAccountStore';
import { clearCache, getCacheUsage } from '../services/db';
import { setStatusMessage } from '../stores/useStatusMessageStore';
import type { MediaId, ProviderCollection } from '../types/onlineMusic';

// src/hooks/useAppleMusicLibrary.ts
// Keep Apple's user-library state in the same account contract consumed by both UI suites.
export function useAppleMusicLibrary() {
    const { t } = useTranslation();
    const account = useOnlineProviderAccountStore(state => state.accounts.applemusic);
    const [cacheSize, setCacheSize] = useState('0 B');
    const [isSyncing, setSyncing] = useState(false);
    const generation = useRef(0);
    const [startup] = useState(() => createAppleMusicStartupConnection(
        () => omni.getLoginStatus('applemusic'), () => omni.authorizeProvider('applemusic')));
    const refreshUserData = useCallback(async () => {
        const current = ++generation.current;
        const store = useOnlineProviderAccountStore.getState();
        try {
            store.updateAccount('applemusic', { freshness: 'refreshing', error: undefined });
            const user = await startup.getUser();
            if (current !== generation.current) return false;
            if (!user) { store.clearAccount('applemusic'); return false; }
            store.updateAccount('applemusic', { user, status: 'authenticated', hydration: 'ready' });
            const collections: ProviderCollection[] = [];
            let offset = 0;
            do {
                const page = await omni.getProviderUserPlaylists('applemusic', user.id, { limit: 100, offset });
                if (current !== generation.current) return false;
                collections.push(...page.items);
                if (!page.hasMore || page.nextOffset <= offset) break;
                offset = page.nextOffset;
            } while (true);
            if (current !== generation.current) return false;
            store.updateAccount('applemusic', { user, collections, status: 'authenticated', hydration: 'ready', freshness: 'fresh', lastUpdatedAt: Date.now() });
            return true;
        } catch (error) {
            if (current !== generation.current) return false;
            store.updateAccount('applemusic', { hydration: 'ready', freshness: 'error',
                error: error instanceof Error ? error.message : String(error) });
            return false;
        }
    }, [t, startup]);
    const updateCacheSize = useCallback(async () => {
        const usage = await getCacheUsage();
        const bytes = usage;
        setCacheSize(bytes > 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`);
    }, []);
    const handleClearCache = useCallback(async () => { await clearCache(); await updateCacheSize(); }, [updateCacheSize]);
    const handleSyncData = useCallback(async () => {
        setSyncing(true);
        try {
            const ok = await refreshUserData();
            setStatusMessage({ type: ok ? 'success' : 'error', text: t(ok ? 'status.dataSynced' : 'status.syncFailed') });
        } finally { setSyncing(false); }
    }, [refreshUserData, t]);
    const handleLogout = useCallback(async () => {
        generation.current++;
        startup.disable();
        await omni.logout('applemusic');
        useOnlineProviderAccountStore.getState().clearAccount('applemusic');
    }, [startup]);
    const setLikedSongIds: Dispatch<SetStateAction<Set<MediaId>>> = useCallback(() => {}, []);
    useEffect(() => {
        void refreshUserData();
        void updateCacheSize();
        return () => { generation.current++; };
    }, [refreshUserData, updateCacheSize]);
    return { user: account?.user || null, playlists: account?.collections || [], cloudPlaylist: null,
        likedSongIds: new Set<MediaId>(), setLikedSongIds, isSyncing, cacheSize, refreshUserData,
        updateCacheSize, handleClearCache, handleSyncData, handleLogout };
}
