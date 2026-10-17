import { OnlineProviderError, type ProviderErrorCode } from '../../types/onlineMusic';

// src/services/onlineMusic/appleMusicTransport.ts
export async function requestAppleMusic<T>(operation: string, params: Record<string, unknown> = {}): Promise<T> {
    const bridge = typeof window === 'undefined' ? undefined : window.electron?.appleMusicRequest;
    if (!bridge) throw new OnlineProviderError('unavailable', 'Apple Music 需要 macOS 桌面版。', 'applemusic');
    const result = await bridge(operation, params);
    if (!result.ok) {
        const code = result.error?.code;
        throw new OnlineProviderError((code === 'developer-setup' ? 'unavailable' : code || 'service-unavailable') as ProviderErrorCode,
            result.error?.message || 'Apple Music request failed', 'applemusic');
    }
    return result.data as T;
}
let storefront: Promise<string> | null = null;
export function clearAppleMusicSession() { storefront = null; }
export async function appleCatalogPath(resource: string): Promise<string> {
    storefront ??= requestAppleMusic<{ id: string }>('storefront').then(value => value.id).catch(error => { storefront = null; throw error; });
    return `/v1/catalog/${await storefront}/${resource}`;
}
export async function appleApi<T>(path: string, query: Record<string, string> = {}): Promise<T> {
    return requestAppleMusic<T>('api', { path, query });
}
