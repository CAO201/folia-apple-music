# Folia Apple Music 本地版

基于 Folia v0.7.20（1b39fd868e2ddda95788f1baa839c032f3e7a285），保留 AGPL-3.0 许可与原作者署名。

## 默认接入方式：Mac 自带“音乐”App

无需 Apple Developer 付费会员。你需要在“音乐”App 登录 Apple 账号，并拥有播放订阅歌曲所需的 Apple Music 会员。

1. 打开“Folia Apple Music”。
2. 首次打开会自动启动系统“音乐”并请求连接；需要重试时点击资料库信息条的连接图标，选择 Apple Music。
3. 如果 macOS 询问，允许 Folia Apple Music 控制“音乐”。这会读取音乐资料库，并允许播放、暂停、跳转和音量控制。
4. 歌单、专辑和“我的全部歌曲”显示在原 Folia 资料库界面中；点击歌曲或播放全部。
5. “音乐”App 在后台输出音频，Folia 使用真实进度同步原有歌词动画。

如果拒绝过自动化权限：在系统设置 → 隐私与安全性 → 自动化中允许本应用控制“音乐”，然后重新连接。

## 已实现的功能

- 播放来源仅 Apple Music：网易云、QQ、酷狗、波点不再注册；其桌面播放后端不启动，原始请求入口也被禁用。
- macOS Music 资料库歌单、全部歌曲、专辑读取、搜索、分页及原有 Grid / Bravais 界面。
- 资料库歌曲完整播放、暂停、继续、进度跳转、上一首/下一首、队列、单曲循环及音量控制。
- 使用 Music 资料库原始封面，经 Folia 已有封面协议缓存显示。
- 原有歌词渲染器、背景和主题保留；网易云自动匹配歌词，优先逐字 YRC，回退逐行 LRC（含可用翻译与音译）；可以通过原有导入功能载入自己的逐字 TTML / 增强 LRC。
- 歌曲 ID、播放时间与歌词时钟分离，防止旧请求覆盖新选曲。
- 独立应用 ID 与配置目录，默认中文，不覆盖原版 Folia。

## 明确边界

- 此版本的默认模式是“音乐”App 的控制与显示前端，不是在 Electron 内解密 Apple Music 音频。
- 全站搜索来自 Apple 公开目录及官方音乐网页，默认 CN，首次确认地区，可筛选 172 个地区并记住选择。CN 等地区使用同区网页与 Apple lookup 补充元数据，网页候选数量有限；不会切换其他区或使用其他音源。已在资料库内且标题、歌手、时长吻合的歌曲可以播放；未入库歌曲会打开官方页面，需先在“音乐”App 加入资料库再回来刷新。没有使用试听音频替代完整歌曲。
- Apple 官方逐字歌词未通过公开接口取得。自动歌词覆盖率取决于网易云的收录与版本匹配；精确逐字动画需要合适的逐字歌词文件。缺词、错版可用原 Folia 导入/偏移功能修正。
- 不宣称支持 Apple Music 音频抓取、离线文件解密、人声分离、原始音频频谱、自动混音、录制歌曲音轨；系统播放模式不向 Web Audio 提供 PCM。
- 歌单编辑、收藏修改、歌手目录浏览、个性化推荐尚未接入，能力开关关闭，不假装操作成功。
- “音乐”App 自身管理账号、订阅、音质、下载和 AirPlay。
- 在 Folia 里断开连接会暂停由本应用选择的音乐并停止读取；系统自动化权限需要在系统设置里撤销。

## 开发与验证

使用 Node 24+。安装依赖：`npm ci`。

- `npm run apple:check`：类型检查与 Apple Music 相关测试。
- `node skills/run-desktop/driver.mjs serve`：使用隔离 profile 启动桌面开发版。
- `ELECTRON=true npx vite build`：构建前端。
- `npm run apple:dmg`：从源码和锁定依赖独立构建、临时签名、制作 DMG，不需要安装原版 Folia。输出在 `release/apple-music/`。
- `npm run apple:source`：导出对应源码及许可材料。

原版平台代码保留作上游参考，不在此版注册为可播放来源。本地/Navidrome 播放也在主播放入口被阻止。

## 可选：独立 MusicKit 原生引擎

`native/apple-music/main.swift` 保留独立原生 MusicKit 实现。仅在后续具备已启用 MusicKit 的开发者 App ID、证书及描述文件时使用；当前默认不依赖它。

设置 `FOLIA_SIGN_IDENTITY`、`FOLIA_MUSICKIT_BUNDLE_ID`、`FOLIA_MUSICKIT_PROFILE` 后运行 `npm run apple:build-native`。构建脚本检查描述文件 App ID 和 MusicKit 权限。以环境变量 `FOLIA_APPLE_MUSIC_ENGINE=native` 启动时选择此引擎。此可选引擎尚未使用真实开发者账号完成授权播放验收。

## 来源

- Folia：https://github.com/chthollyphile/folia-major
- Apple MusicKit：https://developer.apple.com/musickit/
- Music 自动化接口：本机 `/System/Applications/Music.app/Contents/Resources/com.apple.Music.sdef`
- Apple iTunes Search API：https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iTuneSearchAPI/
- LRCLIB：https://lrclib.net/docs

## 网易云歌词更新

Apple Music 继续负责音频。只允许网易云的歌曲元数据搜索、单曲信息与歌词读取，未恢复网易云账号或播放功能；社区 TTML 与 LRCLIB 不再自动请求。匹配要求同名、歌手相符、时长差不超过 4 秒。旧自动歌词缓存已切换版本；手动导入的歌词继续保留。


## 外区歌词、AI 背景与音质更新

- 外区歌曲先使用歌手别名、繁简体和已知作品名称对应；必要时通过 Apple iTunes 的同一曲目 ID 查询大陆/台湾地区名称。只有身份与时长相符才自动采用，未知译名不会按时长猜配。
- 歌词面板的搜索按钮打开网易云专用匹配窗口：支持文字、网易云单曲链接或歌曲 ID，显示歌手、专辑、时长和歌词预览。保存后按 Apple Music 播放身份持久保存；不改变音源。无结果时仍可导入歌词。
- 网易云返回操作频繁时暂停新请求 30 秒，并显示可读错误；不连续重试。
- AI 主题在没有歌词时可根据歌名、歌手、专辑生成，且标注信息来源；仍需在 AI 设置中配置模型服务。未配置时使用明确标注的封面取色备用主题，连接失败显示原因，可再次点击生成重试。
- 已移除播放器音质切换入口，实际音质由 macOS“音乐”App 控制。

## beta.3 逐句歌词

网易云匹配优先，并检查最多 3 个符合录音版本条件的候选；逐字歌词可用时保留逐字动效，否则使用逐句时间轴。网易云不可用时，尝试读取“音乐”App 资料库条目的简介歌词字段；只有字段包含有效时间轴时才自动显示。

歌词面板新增“逐句歌词与时间轴”，也可通过命令面板打开。普通文本可以粘贴、读取简介或从文件导入，然后在 Folia 播放对应歌曲时标记每句开始，支持空格、撤销、秒数微调和按句试听。完整对应的当前歌词时间轴可供复用；不完整时拒绝套用。保存后只影响当前 Apple 歌曲的歌词；不改写系统音乐资料库。

带时间轴的 LRC / Apple 格式 TTML / VTT / YRC 可直接导入。无时间轴的文本保持待同步，不平均分配时间，不冒充逐字歌词。手动选择优先保留，可使用原有清除手动匹配功能恢复自动来源。

本机抽样 20 首资料库歌曲，脚本可读取的 lyrics 字段均为空；Apple 播放器中可见的官方云端歌词不一定暴露给脚本。本版本没有接入未经验证的 Apple 云端同步歌词获取方式，也不自动调用社区歌词服务。
