const { spawn } = require('node:child_process');
const { createInterface } = require('node:readline');
const path = require('node:path');
const fs = require('node:fs');

// electron/appleMusicBridge.cjs
const OPERATIONS = new Set(['health', 'status', 'authorize', 'storefront', 'api', 'play', 'resume', 'pause', 'stop', 'seek', 'state', 'logout']);
function createAppleMusicBridge({ app, dialog }) {
  let child = null;
  let sequence = 0;
  let generation = 0;
  const pending = new Map();
  const failure = (code, message) => ({ ok: false, error: { code, message } });
  function dispose() {
    generation++;
    const previous = child;
    child = null;
    for (const entry of pending.values()) {
      clearTimeout(entry.timer);
      entry.resolve(failure('unavailable', 'Apple Music helper stopped'));
    }
    pending.clear();
    previous?.kill();
  }
  function start() {
    if (child) return;
    if (process.platform !== 'darwin') throw new Error('Apple Music 原生播放当前仅支持 macOS。');
    const root = app.isPackaged ? process.resourcesPath : path.join(__dirname, '..', 'build');
    const executable = path.join(root, 'FoliaMusicBridge.app', 'Contents', 'MacOS', 'FoliaMusicBridge');
    if (!fs.existsSync(executable)) throw new Error('缺少 MusicKit 原生模块，请运行 npm run apple:build-native。');
    child = spawn(executable, [], { stdio: ['pipe', 'pipe', 'pipe'] });
    const ownGeneration = generation;
    const lines = createInterface({ input: child.stdout });
    lines.on('line', line => {
      let response;
      try { response = JSON.parse(line); } catch { return; }
      const entry = pending.get(response.id);
      if (!entry) return;
      pending.delete(response.id);
      clearTimeout(entry.timer);
      entry.resolve(response.error ? { ok: false, error: response.error } : { ok: true, data: response.result });
    });
    // Native diagnostics may contain account details; never send them into renderer logs.
    child.stderr.resume();
    child.stdin.on('error', () => { if (generation === ownGeneration) dispose(); });
    child.on('error', () => { if (generation === ownGeneration) dispose(); });
    child.on('exit', () => { if (generation === ownGeneration) dispose(); });
  }
  async function request(operation, params = {}) {
    if (!OPERATIONS.has(operation)) return failure('unsupported', 'Unsupported Apple Music operation');
    try { start(); } catch (error) { return failure('unavailable', error.message); }
    if (operation === 'authorize') {
      const health = await request('health');
      if (!health.ok || !health.data.signed) {
        await dialog.showMessageBox({ type: 'info', title: 'Apple Music 开发者配置',
          message: 'Apple Music 接入模块已安装，需要 Apple Developer 签名后才能连接。',
          detail: '请按项目 APPLE_MUSIC.md 配置已启用 MusicKit 的 App ID、签名证书及描述文件。账号密码和私钥无需发给 Codex。', buttons: ['知道了'] });
        return failure('unavailable', 'Apple Music 需要 Apple Developer 签名配置。');
      }
    }
    return new Promise(resolve => {
      const id = ++sequence;
      const timer = setTimeout(() => {
        // A timed-out native play must not land later and replace a newer selection.
        dispose();
      }, operation === 'authorize' ? 180000 : 30000);
      pending.set(id, { resolve, timer });
      child.stdin.write(JSON.stringify({ id, operation, params }) + '\n');
    });
  }
  return { request, dispose };
}
module.exports = { createAppleMusicBridge };
