import { create } from 'zustand';

// src/stores/useAppleLyricEditorStore.ts
export const useAppleLyricEditorStore = create<{ expanded: boolean }>(() => ({ expanded: false }));
