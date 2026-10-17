// src/services/appleMusicStartup.ts
// Coalesce first-launch authorization, including React StrictMode. Never play automatically or re-prompt after logout.
export function createAppleMusicStartupConnection<T>(getStatus: () => Promise<T | null>, authorize: () => Promise<boolean>) {
    let connection: Promise<boolean> | null = null;
    let disabled = false;
    return {
        async getUser(): Promise<T | null> {
            let user = await getStatus();
            if (user || disabled) return user;
            connection ??= authorize();
            if (await connection) user = await getStatus();
            return user;
        },
        disable() { disabled = true; },
    };
}
