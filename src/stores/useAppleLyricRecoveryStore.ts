import { create } from 'zustand';
import type { FallbackLyricCandidate } from '../types/onlineMusic';

// src/stores/useAppleLyricRecoveryStore.ts
export const useAppleLyricRecoveryStore = create<{
    key: string; phase: 'idle' | 'searching' | 'found' | 'missing'; candidates: FallbackLyricCandidate[];
}>(() => ({ key: '', phase: 'idle', candidates: [] }));
