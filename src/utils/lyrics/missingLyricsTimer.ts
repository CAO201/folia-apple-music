// src/utils/lyrics/missingLyricsTimer.ts
// Count actual wall-clock time spent playing; seeking beyond five seconds never bypasses the wait.
export function createMissingLyricsTimer(trigger: (key: string, signal: AbortSignal) => void, delay = 5000) {
    let hadLyrics = false;
    let key = '', elapsed = 0, started: number | null = null, attempted = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller = new AbortController();
    const stop = () => {
        if (timer) clearTimeout(timer);
        timer = undefined;
        if (started !== null) elapsed += Math.max(0, Date.now() - started);
        started = null;
    };
    return {
        update(next: { key: string; playing: boolean; hasLyrics: boolean }) {
            stop();
            if (next.key !== key) {
                controller.abort(); controller = new AbortController();
                key = next.key; elapsed = 0; attempted = false;
            }
            if (hadLyrics && !next.hasLyrics) { controller = new AbortController(); attempted = false; }
            hadLyrics = next.hasLyrics;
            if (next.hasLyrics) { controller.abort(); attempted = true; return; }
            if (!key || !next.playing || attempted) return;
            started = Date.now();
            timer = setTimeout(() => {
                stop(); attempted = true;
                if (!controller.signal.aborted) trigger(key, controller.signal);
            }, Math.max(0, delay - elapsed));
        },
        dispose() { stop(); controller.abort(); },
    };
}
