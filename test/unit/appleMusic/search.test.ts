import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';
import { appleSearchRegions, normalizeAppleSearchRegion, useAppleSearchSettingsStore } from '../../../src/stores/useAppleSearchSettingsStore';
import { alternateAppleSearchQuery } from '../../../src/utils/appleSearchQueries';

// test/unit/appleMusic/search.test.ts
const { createAppleSearch } = createRequire(import.meta.url)('../../../electron/apple-music/search.cjs');
const resource = (id: string, name = id) => ({ id, type: 'library-songs', attributes: { name, artistName: 'Artist', durationInMillis: 100000 } });
const item = (id: number) => ({ trackId: id, trackName: `Song ${id}`, artistName: 'Artist', trackTimeMillis: 100000, trackViewUrl: `https://music.apple.com/tr/song/${id}` });
const response = (results: unknown[]) => ({ ok: true, json: async () => ({ results }) });
describe('Apple regional search', () => {
    it('defaults to CN and offers the complete published region list including TR', () => {
        expect(useAppleSearchSettingsStore.getState().region).toBe('CN');
        expect(useAppleSearchSettingsStore.getState().confirmed).toBe(false);
        expect(appleSearchRegions).toContain('TR');
        expect(new Set(appleSearchRegions).size).toBe(172);
        expect(normalizeAppleSearchRegion('tr')).toBe('TR');
        expect(normalizeAppleSearchRegion('invalid')).toBe('CN');
    });
    it('supplies one Chinese/foreign artist alias without changing the original query', () => {
        expect(alternateAppleSearchQuery('周杰倫')).toBe('Jay Chou');
        expect(alternateAppleSearchQuery('Eason Chan 富士山下')).toBe('陈奕迅 富士山下');
        expect(alternateAppleSearchQuery('Taylor Swift')).toBeUndefined();
    });
    it('keeps catalog results when Music library search fails, using the requested country', async () => {
        const fetch = vi.fn(async (_url: string) => response([item(1)]));
        const register = vi.fn();
        const search = createAppleSearch({ fetch, searchLibrary: async () => { throw Error('denied'); }, register });
        const page = await search({ term: 'Song', limit: '25' }, 'tr');
        expect(new URL(fetch.mock.calls[0][0]).searchParams.get('country')).toBe('tr');
        expect(page.data[0].id).toBe('catalog:TR:1');
        expect(page.meta.warning).toContain('资料库');
        expect(register).toHaveBeenCalledWith(page.data[0]);
    });
    it('returns library results and an explanation when the catalog is offline', async () => {
        const search = createAppleSearch({ fetch: async () => { throw Error('offline'); }, searchLibrary: async () => ({ data: [resource('lib')] }), register: () => {} });
        const page = await search({ term: 'Song' }, 'US');
        expect(page.data.map((x: any) => x.id)).toEqual(['lib']);
        expect(page.meta.warning).toContain('offline');
    });
    it('reports both failures and allows a fresh retry', async () => {
        const fetch = vi.fn().mockRejectedValueOnce(Error('offline')).mockResolvedValue(response([item(1)]));
        const search = createAppleSearch({ fetch, searchLibrary: async () => { throw Error('timeout'); }, register: () => {} });
        await expect(search({ term: 'Song' }, 'US')).rejects.toThrow('搜索失败');
        expect((await search({ term: 'Song' }, 'US')).data).toHaveLength(1);
    });
    it('deduplicates against the library, pages a stable snapshot, and isolates countries', async () => {
        const fetch = vi.fn(async (_url: string) => response(Array.from({ length: 40 }, (_, n) => item(n))));
        const library = vi.fn(async () => ({ data: [resource('lib', 'Song 0')] }));
        const search = createAppleSearch({ fetch, searchLibrary: library, register: () => {} });
        const first = await search({ term: 'Song', limit: '25' }, 'TR');
        const second = await search({ term: 'Song', limit: '25', offset: '25' }, 'TR');
        expect(first.meta.total).toBe(40);
        expect(first.next).toBeTruthy();
        expect(second.data).toHaveLength(15);
        expect(second.next).toBeUndefined();
        expect(new Set([...first.data, ...second.data].map(x => x.id)).size).toBe(40);
        expect(fetch).toHaveBeenCalledTimes(1);
        expect(new URL(fetch.mock.calls[0][0]).searchParams.has('offset')).toBe(false);
        await search({ term: 'Song' }, 'US');
        expect(fetch).toHaveBeenCalledTimes(2);
    });
    it('coalesces simultaneous queries and only expands sparse results once', async () => {
        const fetch = vi.fn(async (_url: string) => response([item(1)]));
        const search = createAppleSearch({ fetch, searchLibrary: async () => ({ data: [] }), register: () => {} });
        await Promise.all([search({ term: '周杰伦', alternateTerm: 'Jay Chou' }, 'TR'), search({ term: '周杰伦', alternateTerm: 'Jay Chou' }, 'TR')]);
        expect(fetch).toHaveBeenCalledTimes(2);
    });
    it('keeps the same snapshot when a later page is requested after the refresh TTL', async () => {
        let time = 0;
        const fetch = vi.fn(async () => response(Array.from({ length: 40 }, (_, n) => item(n))));
        const search = createAppleSearch({ fetch, searchLibrary: async () => ({ data: [] }), register: () => {}, now: () => time });
        await search({ term: 'Song', limit: '25' }, 'TR');
        time = 180001;
        const second = await search({ term: 'Song', limit: '25', offset: '25' }, 'TR');
        expect(second.data[0].id).toBe('catalog:TR:26');
        expect(fetch).toHaveBeenCalledTimes(1);
        await search({ term: 'Song', limit: '25' }, 'TR');
        expect(fetch).toHaveBeenCalledTimes(2);
    });
    it('requires a new search instead of mixing pages when a snapshot has been evicted', async () => {
        const fetch = vi.fn(async () => response([item(1)]));
        const search = createAppleSearch({ fetch, searchLibrary: async () => ({ data: [] }), register: () => {} });
        for (let n = 0; n < 33; n++) await search({ term: `Query ${n}` }, 'TR');
        await expect(search({ term: 'Query 0', offset: '25' }, 'TR')).rejects.toThrow('重新搜索');
        expect(fetch).toHaveBeenCalledTimes(33);
    });
    it('rejects malformed regions before any external call', async () => {
        const fetch = vi.fn();
        const search = createAppleSearch({ fetch, searchLibrary: vi.fn(), register: vi.fn() });
        await expect(search({ term: 'Song' }, '../../')).rejects.toThrow('地区');
        expect(fetch).not.toHaveBeenCalled();
    });
});
