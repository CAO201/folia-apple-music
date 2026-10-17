import type { SongResult } from '../../types';
import { processNeteaseLyrics } from '../../utils/lyrics/neteaseProcessing';
import type { RawNeteaseLyric } from '../../utils/lyrics/types';

// src/services/onlineMusic/appleNeteaseLyricTools.ts
// Provider adapter shared by automatic lyrics and the explicit Apple-to-NetEase correction workflow.
export async function requestAppleLyricMetadata(operation: 'search' | 'lyrics' | 'detail' | 'localized', params: Record<string, unknown>) {
    const bridge = typeof window === 'undefined' ? undefined : window.electron?.neteaseLyricsRequest;
    if (!bridge) throw new Error('网易云歌词需要桌面版。');
    const response = await bridge(operation, params);
    if (!response.ok) throw new Error(response.error || '网易云歌词请求失败，请重试。');
    return response.data;
}
export async function fetchAppleNeteaseLyrics(id: string) {
    const data = await requestAppleLyricMetadata('lyrics', { id });
    return processNeteaseLyrics(data as RawNeteaseLyric);
}
export async function searchAppleNeteaseLyrics(query: string): Promise<SongResult[]> {
    const value = query.trim();
    const link = value.match(/^https?:\/\/(?:music\.163\.com|y\.music\.163\.com)\//i);
    const id = /^\d{1,20}$/.test(value) ? value : link && /\/song(?:\?|\/)/i.test(value) ? value.match(/[?&]id=(\d{1,20})(?:&|$)/)?.[1] : null;
    if (link && !id) throw new Error('请粘贴包含歌曲 ID 的网易云单曲链接。');
    return (await requestAppleLyricMetadata(id ? 'detail' : 'search', id ? { id } : { keywords: value }))?.songs || [];
}
