import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

// test/unit/appleMusic/webSearch.test.ts
const { searchAppleWeb } = createRequire(import.meta.url)('../../../electron/apple-music/webSearch.cjs');
const html = (storefront = 'cn', ids = ['1', '2']) => `<script type="application/json" id="serialized-server-data">${JSON.stringify({ data: [{
    intent: { $kind: 'SearchResultsPageIntent', storefront }, data: { sections: [{ items: ids.map(id => ({ contentDescriptor: { kind: 'song', identifiers: { storeAdamID: id } } })) }] },
}] })}</script>`;
describe('Apple official search page fallback', () => {
    it('resolves CN song IDs using the same country and preserves page order', async () => {
        const fetch = vi.fn().mockResolvedValueOnce({ ok: true, text: async () => html() })
            .mockResolvedValueOnce({ ok: true, json: async () => ({ results: [{ kind: 'song', trackId: 2, trackName: 'Second', trackTimeMillis: 123000 }, { kind: 'song', trackId: 1, trackName: 'First', trackTimeMillis: 100000 }] }) });
        const items = await searchAppleWeb({ fetch, term: '陈奕迅', region: 'CN' });
        expect(items.map((s: any) => s.trackId)).toEqual([1, 2]);
        expect(new URL(fetch.mock.calls[0][0]).pathname).toBe('/cn/search');
        expect(new URL(fetch.mock.calls[1][0]).searchParams.get('country')).toBe('cn');
        expect(new URL(fetch.mock.calls[1][0]).searchParams.get('id')).toBe('1,2');
    });
    it('does not silently use another region or accept a changed page format', async () => {
        for (const body of [html('us'), '<html>Changed</html>']) {
            await expect(searchAppleWeb({ fetch: async () => ({ ok: true, text: async () => body }), term: 'Song', region: 'CN' })).rejects.toThrow();
        }
    });
    it('treats a valid empty result as empty without sending lookup requests', async () => {
        const fetch = vi.fn(async () => ({ ok: true, text: async () => html('cn', []) }));
        expect(await searchAppleWeb({ fetch, term: 'No match', region: 'CN' })).toEqual([]);
        expect(fetch).toHaveBeenCalledTimes(1);
    });
});
