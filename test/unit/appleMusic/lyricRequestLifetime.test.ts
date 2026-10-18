import { afterEach, expect, it, vi } from 'vitest';
import { awaitLyricRequest, lyricPriorityGrace } from '../../../src/utils/lyrics/lyricRequestLifetime';

// test/unit/appleMusic/lyricRequestLifetime.test.ts
afterEach(()=>vi.useRealTimers());
it('stops awaiting a stuck native request immediately on cancellation',async()=>{
    const controller=new AbortController();const job=awaitLyricRequest(new Promise(()=>{}),controller.signal);
    controller.abort();await expect(job).rejects.toThrow();
});
it('starts independent sources after the NetEase grace period expires',async()=>{
    vi.useFakeTimers();const controller=new AbortController();
    const grace=lyricPriorityGrace(new Promise(()=>{}),controller.signal);
    await vi.advanceTimersByTimeAsync(2000);await expect(grace).resolves.toBeNull();
});
it('takes a timely NetEase result without waiting for the grace timer',async()=>{
    await expect(lyricPriorityGrace(Promise.resolve('NetEase'),new AbortController().signal)).resolves.toBe('NetEase');
});
