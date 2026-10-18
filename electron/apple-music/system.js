// electron/apple-music/system.js
// Static JXA command implementation. Parameters are JSON argv, never interpolated script text.
function run(argv) {
    const request = JSON.parse(argv[0]);
    const p = request.params || {};
    const music = Application('com.apple.Music');
    const operation = request.operation;
    function page(items) {
        const offset = Math.max(0, Number(p.offset) || 0);
        const limit = Math.min(100, Math.max(1, Number(p.limit) || 50));
        return { data: items.slice(offset, offset + limit), total: items.length, hasMore: offset + limit < items.length, nextOffset: Math.min(items.length, offset + limit) };
    }
    function track(item) {
        const a = item.properties();
        return { id: a.persistentID, type: 'library-songs', attributes: {
            name: a.name || '', artistName: a.artist || '', albumName: a.album || '',
            durationInMillis: Math.round((a.duration || 0) * 1000),
        } };
    }
    function library() { return music.libraryPlaylists[0]; }
    function bulkTracks(list) {
        const ids = list.persistentID();
        const names = list.name();
        const artists = list.artist();
        const albums = list.album();
        const durations = list.duration();
        return ids.map(function (id, i) { return { id: id, type: 'library-songs', attributes: {
            name: names[i] || '', artistName: artists[i] || '', albumName: albums[i] || '',
            durationInMillis: Math.round((durations[i] || 0) * 1000)
        } }; });
    }
    function lookup(id) {
        const matches = library().tracks.whose({ persistentID: id });
        if (!matches.length) throw Error('此歌曲不在“音乐”App 资料库中，请先将歌曲加入资料库。');
        return matches[0];
    }
    function state() {
        const status = music.playerState();
        let current = null;
        if (status !== 'stopped') {
            try { current = track(music.currentTrack); } catch (_) {}
        }
        return { mediaId: current ? current.id : '', time: current ? music.playerPosition() : 0,
            duration: current ? current.attributes.durationInMillis / 1000 : 0,
            playing: status === 'playing', status: status, track: current, volume: music.soundVolume() / 100, muted: music.mute() };
    }
    let result;
    switch (operation) {
        case 'authorize':
            music.launch();
            // A version query alone does not prove automation permission; read a library property before connecting.
            result = { authorized: Boolean(music.version()) && Boolean(library().persistentID()), canPlay: true }; break;
        case 'play': music.play(lookup(p.mediaId), { once: true }); result = state(); break;
        case 'resume': music.play(); result = state(); break;
        case 'pause': music.pause(); result = state(); break;
        case 'stop':
            if (p.mediaId && music.playerState() !== 'stopped' && music.currentTrack.persistentID() === p.mediaId) music.pause();
            result = state(); break;
        case 'seek': music.playerPosition = Math.max(0, Number(p.time) || 0); result = state(); break;
        case 'volume':
            music.soundVolume = Math.round(Math.max(0, Math.min(1, Number(p.volume))) * 100);
            music.mute = Boolean(p.muted); result = {}; break;
        case 'state': result = state(); break;
        case 'playlists': {
            const lists = music.playlists();
            result = page(lists.filter(function (item) { return !['Library', 'Music', 'folder'].includes(item.specialKind()); }).map(function (item) {
                const a = item.properties();
                return { id: a.persistentID, type: 'library-playlists', attributes: { name: a.name || '', trackCount: item.tracks.length } };
            }));
            break;
        }
        case 'tracks': {
            const list = p.id === 'apple-library-songs' ? library() : music.playlists.whose({ persistentID: p.id })[0];
            if (!list) throw Error('找不到此歌单，请刷新资料库。');
            result = page(bulkTracks(list.tracks));
            break;
        }
        case 'search': {
            const matches = music.search(library(), { for: String(p.term || ''), only: 'all' });
            const offset = Math.max(0, Number(p.offset) || 0);
            const limit = Math.min(100, Math.max(1, Number(p.limit) || 50));
            result = { data: matches.slice(offset, offset + limit).map(track), total: matches.length,
                hasMore: offset + limit < matches.length, nextOffset: Math.min(matches.length, offset + limit) }; break;
        }
        case 'detail': result = { data: [track(lookup(p.id))] }; break;
        case 'resolve': {
            const matches = music.search(library(), { for: String(p.title || ''), only: 'names' });
            const norm = function (s) { return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim(); };
            const match = matches.map(track).find(function (t) {
                const a = t.attributes;
                return norm(a.name) === norm(p.title) && norm(a.artistName) === norm(p.artist)
                    && Math.abs(a.durationInMillis - Number(p.duration || 0)) < 3000;
            });
            result = match || null; break;
        }
        case 'albums': {
            // Group the user's library by album identity; keep the track IDs for lazy album browsing.
            const map = {};
            const list = library();
            const items = bulkTracks(list.tracks);
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                const a = item.attributes;
                const key = a.albumName + '\u0000' + a.artistName;
                if (!map[key]) map[key] = { id: 'album:' + item.id, type: 'library-albums', attributes: { name: a.albumName, artistName: a.artistName, trackCount: 0 } };
                map[key].attributes.trackCount++;
            }
            result = page(Object.keys(map).map(function (key) { return map[key]; })); break;
        }
        case 'albumTracks': {
            const base = track(lookup(String(p.id).slice(6)));
            const matches = music.search(library(), { for: base.attributes.albumName, only: 'albums' });
            result = page(matches.map(track).filter(function (t) { return t.attributes.albumName === base.attributes.albumName && t.attributes.artistName === base.attributes.artistName; }));
            break;
        }
        default: throw Error('Unsupported Music automation operation');
    }
    return JSON.stringify(result);
}
