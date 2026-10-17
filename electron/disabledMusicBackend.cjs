// electron/disabledMusicBackend.cjs
// Retain the host's backend lifecycle contract without loading any legacy music service.
const disabled = { status: 'unavailable', port: null, error: 'Apple Music 专用版本已移除此平台播放功能。' };
const createDisabledMusicBackend = () => ({
  statusChannel: 'disabled-music-backend', start: async () => disabled, stop: async () => {},
  getPort: () => null, getStatus: () => ({ ...disabled }),
  getDiagnostics: () => ({ backend: { ...disabled }, startup: [], connections: [] }), selfCheckHosts: [],
});
module.exports = { createDisabledMusicBackend };
