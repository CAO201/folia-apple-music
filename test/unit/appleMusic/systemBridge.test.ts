import { createRequire } from 'node:module';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// test/unit/appleMusic/systemBridge.test.ts
// Exercise the shipped static JXA dispatcher against Music's public scripting contract.
import fs from 'node:fs';
import vm from 'node:vm';
const script = fs.readFileSync('electron/apple-music/system.js', 'utf8');
const song = { persistentID: 'AF12345678901234', name: 'Song', artist: 'Artist', album: 'Album', duration: 123 };
function fixture() {
    const track = { properties: () => song, persistentID: () => song.persistentID };
    const tracks: any = { length: 1, 0: track, whose: () => [track],
        persistentID: () => [song.persistentID], name: () => [song.name], artist: () => [song.artist], album: () => [song.album], duration: () => [song.duration] };
    const playlist = { tracks, specialKind: () => 'none', properties: () => ({ persistentID: 'playlist-id', name: 'Playlist' }) };
    const playlists = Object.assign(() => [playlist], { whose: () => [playlist] });
    return { version: () => '1', libraryPlaylists: [playlist], playlists, search: () => [track], playerState: () => 'playing',
        playerPosition: () => 30, currentTrack: track, soundVolume: () => 50, mute: () => false,
        play: vi.fn(), pause: vi.fn() };
}
describe('Music.app scripting adapter', () => {
    it('reads library songs in bulk without leaking unrelated track properties', () => {
        const music = fixture();
        const context: any = { Application: () => music };
        vm.runInNewContext(script, context);
        const page = JSON.parse(context.run([JSON.stringify({ operation: 'tracks', params: { id: 'apple-library-songs', limit: 50 } })]));
        expect(page.total).toBe(1);
        expect(page.data[0]).toEqual({ id: song.persistentID, type: 'library-songs', attributes: {
            name: 'Song', artistName: 'Artist', albumName: 'Album', durationInMillis: 123000,
        } });
    });
    it('plays an exact persistent library ID once and reads the real clock', () => {
        const music = fixture();
        const context: any = { Application: () => music };
        vm.runInNewContext(script, context);
        const result = JSON.parse(context.run([JSON.stringify({ operation: 'play', params: { mediaId: song.persistentID } })]));
        expect(music.play).toHaveBeenCalledWith(music.currentTrack, { once: true });
        expect(result).toMatchObject({ playing: true, time: 30, duration: 123, mediaId: song.persistentID });
    });
    it('refuses same-title alternate recordings when resolving a catalog selection', () => {
        const context: any = { Application: () => fixture() };
        vm.runInNewContext(script, context);
        expect(JSON.parse(context.run([JSON.stringify({ operation: 'resolve', params: { title: 'Song', artist: 'Other Artist', duration: 123000 } })]))).toBeNull();
    });
    it('does not stop a song selected outside Folia', () => {
        const music = fixture();
        const context: any = { Application: () => music };
        vm.runInNewContext(script, context);
        context.run([JSON.stringify({ operation: 'stop', params: { mediaId: 'OTHER' } })]);
        expect(music.pause).not.toHaveBeenCalled();
    });
});
