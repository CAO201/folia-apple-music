// src/utils/lyrics/lyricRequestLifetime.ts
// Cancel renderer work promptly even when a native HTTP request is already in flight.
export function awaitLyricRequest<T>(job: Promise<T>, signal?: AbortSignal): Promise<T> {
    if (!signal) return job;
    signal.throwIfAborted();
    return new Promise<T>((resolve, reject) => {
        const abort = () => reject(signal.reason || new DOMException('Aborted', 'AbortError'));
        signal.addEventListener('abort', abort, { once: true });
        job.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
    });
}
export async function lyricPriorityGrace<T>(job: Promise<T>, signal: AbortSignal, ms = 2000): Promise<T | null> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        return await awaitLyricRequest(Promise.race([job, new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), ms); })]), signal);
    } finally { if (timer) clearTimeout(timer); }
}
