import { create } from 'zustand';
import regionData from '../../shared/appleSearchRegions.json';

// src/stores/useAppleSearchSettingsStore.ts
export const appleSearchRegions: string[] = regionData.regions;
export function normalizeAppleSearchRegion(value: unknown): string {
    const code = typeof value === 'string' ? value.toUpperCase() : '';
    return appleSearchRegions.includes(code) ? code : 'CN';
}
const key = 'apple_music_search_region';
const read = () => { try { return localStorage.getItem(key); } catch { return null; } };
export const useAppleSearchSettingsStore = create<{
    region: string; confirmed: boolean; setRegion: (region: string) => void;
}>((set) => ({
    region: normalizeAppleSearchRegion(read()), confirmed: appleSearchRegions.includes(String(read() || '').toUpperCase()),
    setRegion: value => {
        const region = normalizeAppleSearchRegion(value);
        try { localStorage.setItem(key, region); } catch { /* Keep the session usable without storage. */ }
        set({ region, confirmed: true });
    },
}));
