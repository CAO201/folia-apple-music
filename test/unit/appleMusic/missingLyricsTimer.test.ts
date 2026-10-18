import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createMissingLyricsTimer } from '../../../src/utils/lyrics/missingLyricsTimer';

// test/unit/appleMusic/missingLyricsTimer.test.ts
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
it('waits five actual playing seconds and only triggers once', () => {
    const trigger = vi.fn(); const timer = createMissingLyricsTimer(trigger);
    timer.update({key:'A',playing:true,hasLyrics:false});
    vi.advanceTimersByTime(4999); expect(trigger).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1); expect(trigger).toHaveBeenCalledTimes(1);
    timer.update({key:'A',playing:true,hasLyrics:false}); vi.advanceTimersByTime(9000);
    expect(trigger).toHaveBeenCalledTimes(1); timer.dispose();
});
it('excludes paused time and preserves accumulated playing time', () => {
    const trigger = vi.fn(); const timer = createMissingLyricsTimer(trigger);
    timer.update({key:'A',playing:true,hasLyrics:false}); vi.advanceTimersByTime(2000);
    timer.update({key:'A',playing:false,hasLyrics:false}); vi.advanceTimersByTime(20000);
    expect(trigger).not.toHaveBeenCalled();
    timer.update({key:'A',playing:true,hasLyrics:false}); vi.advanceTimersByTime(3000);
    expect(trigger).toHaveBeenCalledTimes(1); timer.dispose();
});
it('aborts old requests and starts a new five-second period on a song change', () => {
    const trigger = vi.fn(); const timer = createMissingLyricsTimer(trigger);
    timer.update({key:'A',playing:true,hasLyrics:false}); vi.advanceTimersByTime(5000);
    const signal = trigger.mock.calls[0][1] as AbortSignal;
    timer.update({key:'B',playing:true,hasLyrics:false}); expect(signal.aborted).toBe(true);
    vi.advanceTimersByTime(4999); expect(trigger).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1); expect(trigger.mock.calls[1][0]).toBe('B'); timer.dispose();
});
it('does not mistake an empty intro for missing lyrics when a real timeline exists', () => {
    const trigger = vi.fn(); const timer = createMissingLyricsTimer(trigger);
    timer.update({key:'A',playing:true,hasLyrics:true}); vi.advanceTimersByTime(30000);
    expect(trigger).not.toHaveBeenCalled(); timer.dispose();
});
it('handles the old lyric being cleared just after the new song is selected', () => {
    const trigger = vi.fn(); const timer = createMissingLyricsTimer(trigger);
    timer.update({key:'A',playing:true,hasLyrics:true});
    timer.update({key:'B',playing:true,hasLyrics:true});
    timer.update({key:'B',playing:true,hasLyrics:false}); vi.advanceTimersByTime(5000);
    expect(trigger).toHaveBeenCalledTimes(1); timer.dispose();
});
