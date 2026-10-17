// src/types/appleMusic.ts
export interface AppleMusicState {
    mediaId: string;
    time: number;
    duration: number;
    playing: boolean;
    status: string;
    volume?: number; muted?: boolean;
}
export interface AppleResource {
    id: string;
    type: string;
    attributes?: {
        name?: string; artistName?: string; albumName?: string; durationInMillis?: number;
        artwork?: { url: string }; description?: { standard?: string }; trackCount?: number;
        isrc?: string; url?: string; playParams?: { id?: string; catalogId?: string; isLibrary?: boolean };
    };
    relationships?: Record<string, { data?: AppleResource[]; next?: string }>;
}
export interface AppleResponse { data?: AppleResource[]; next?: string; meta?: { total?: number } }
