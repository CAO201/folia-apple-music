import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../../src/services/onlineMusic/omni', () => ({ omni: { controlExternalPlayback: vi.fn() } }));
import { omni } from '../../../src/services/onlineMusic/omni';
import { controlAppleMusic, getAppleMusicClock, resetAppleMusicClock } from '../../../src/services/appleMusicPlayback';

// test/unit/appleMusic/playbackClock.test.ts
const source = 'applemusic://song/ABCD';
const state = { mediaId: 'ABCD', time: 10, duration: 100, playing: true, status: 'playing' };
afterEach(() => { resetAppleMusicClock(); vi.restoreAllMocks(); });
describe('native clock synchronization', () => {
    it('interpolates a bounded amount and cannot drive another song', async () => {
        const now = vi.spyOn(performance, 'now').mockReturnValue(1000);
        vi.mocked(omni.controlExternalPlayback).mockResolvedValue(state);
        await controlAppleMusic('play', source);
        now.mockReturnValue(1500);
        expect(getAppleMusicClock(source)?.time).toBe(10.5);
        now.mockReturnValue(9999);
        expect(getAppleMusicClock(source)?.time).toBe(11.5);
        expect(getAppleMusicClock('applemusic://song/OTHER')).toBeNull();
    });
    it('does not apply an old poll after a seek', async () => {
        let finish: (value: typeof state) => void = () => {};
        vi.mocked(omni.controlExternalPlayback).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
        const poll = controlAppleMusic('state', source);
        vi.mocked(omni.controlExternalPlayback).mockResolvedValue({ ...state, time: 50, playing: false });
        await controlAppleMusic('seek', source, 50);
        finish(state);
        expect(await poll).toBeNull();
        expect(getAppleMusicClock(source)?.time).toBe(50);
    });
    it('ignores an in-flight response after playback is cleaned up', async () => {
        let finish: (value: typeof state) => void = () => {};
        vi.mocked(omni.controlExternalPlayback).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
        const request = controlAppleMusic('play', source);
        resetAppleMusicClock();
        finish(state);
        expect(await request).toBeNull();
        expect(getAppleMusicClock(source)).toBeNull();
    });
});
