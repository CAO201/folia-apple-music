// scripts/apple-music/builder.config.cjs
// Independent source build: no installed upstream app or developer signing identity is required.
module.exports = {
  extends: null,
  appId: 'local.folia.applemusic', productName: 'Folia Apple Music',
  directories: { output: 'release/apple-music', buildResources: 'build' },
  npmRebuild: false, publish: null, forceCodeSigning: false,
  electronLanguages: ['en-US', 'zh-CN', 'zh-TW', 'id'],
  files: ['dist/**/*', 'electron/**/*', 'shared/**/*', 'package.json', 'build/miao.png', 'build/thumbar/*.png',
    'LICENSE', 'NOTICE.md', 'THIRD_PARTY_NOTICES.md', 'APPLE_MUSIC.md'],
  asarUnpack: ['electron/analysis/htdemucs_runner.py', 'node_modules/onnxruntime-node/bin/**', 'node_modules/@koromix/koffi-*/**/*.node'],
  extraResources: [
    { from: 'build/ffmpeg/${os}-${arch}', to: 'ffmpeg-audio' },
    { from: 'build/koffi/darwin_${arch}', to: 'koffi/darwin_${arch}' },
    { from: 'build/icon.png', to: 'icon.png' },
    { from: 'build/trayTemplate.png', to: 'trayTemplate.png' },
    { from: 'build/trayTemplate@2x.png', to: 'trayTemplate@2x.png' },
    { from: 'release-materials/licenses', to: 'licenses' },
    { from: 'release-materials/third-party-sources', to: 'third-party-sources' },
  ],
  beforePack: './build/beforePack.cjs', afterPack: './build/afterPack.cjs',
  mac: { identity: null, icon: 'build/icon.png', target: ['dir'], category: 'public.app-category.music',
    extendInfo: { NSAppleEventsUsageDescription: 'Folia Apple Music 需要读取“音乐”App 的资料库，并控制你选择的歌曲播放、暂停和进度。' } },
};
