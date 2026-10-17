// src/utils/appleMusicSource.ts
const SOURCE = /^applemusic:\/\/song\/([^/?#]+)$/;
export const isAppleMusicSource = (source: string | null | undefined): source is string => Boolean(source && SOURCE.test(source));
export const appleMusicSourceId = (source: string): string => {
    const match = SOURCE.exec(source);
    if (!match) throw new Error('Invalid Apple Music playback reference');
    return decodeURIComponent(match[1]);
};
