import { describe, expect, it, vi } from 'vitest';
import { createAppleMusicStartupConnection } from '../../../src/services/appleMusicStartup';

// test/unit/appleMusic/startup.test.ts
// First-launch prompts coalesce; a denied prompt or explicit disconnect must not loop.
describe('automatic Music connection', () => {
    it('authorizes once for concurrent refreshes, then reads each user’s own status', async () => {
        let connected = false;
        const authorize = vi.fn(async () => { connected = true; return true; });
        const startup = createAppleMusicStartupConnection(async () => connected ? { id: 'local-user' } : null, authorize);
        const users = await Promise.all([startup.getUser(), startup.getUser()]);
        expect(authorize).toHaveBeenCalledTimes(1);
        expect(users).toEqual([{ id: 'local-user' }, { id: 'local-user' }]);
    });
    it('does not reprompt when denied or when the user disconnects', async () => {
        const authorize = vi.fn(async () => { throw new Error('denied'); });
        const startup = createAppleMusicStartupConnection(async () => null, authorize);
        await expect(startup.getUser()).rejects.toThrow('denied');
        await expect(startup.getUser()).rejects.toThrow('denied');
        expect(authorize).toHaveBeenCalledTimes(1);
        startup.disable();
        expect(await startup.getUser()).toBeNull();
        expect(authorize).toHaveBeenCalledTimes(1);
    });
    it('does not authorize an already connected account', async () => {
        const authorize = vi.fn(async () => true);
        const startup = createAppleMusicStartupConnection(async () => ({ id: 'user' }), authorize);
        expect(await startup.getUser()).toEqual({ id: 'user' });
        expect(authorize).not.toHaveBeenCalled();
    });
});
