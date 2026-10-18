# Folia Apple Music（免费测试版）

基于 [Folia](https://github.com/chthollyphile/folia-major) 的非官方 macOS 修改版。**原作者为 chthollyphile 与 Folia 原项目贡献者**，基于 v0.7.20 / `1b39fd868e2ddda95788f1baa839c032f3e7a285`。感谢原作者提供的界面、歌词渲染、动画与主题系统。

本分支继续使用 **GNU AGPL-3.0**。完整原作者说明与致谢见 [README.upstream.md](README.upstream.md)，署名及修改说明见 [NOTICE.md](NOTICE.md)，完整许可见 [LICENSE](LICENSE)，依赖许可见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。本分支不代表原作者、Apple 或网易云官方发行。

## 功能

- 保留 Folia 的界面、歌词动画、主题、背景与播放队列。
- 通过 macOS“音乐”App 播放用户自己的 Apple Music 资料库；首次运行自动启动“音乐”并请求连接，用户确认授权后载入资料库。选歌后才播放。
- 音频始终由 Apple Music 提供；网易云只提供歌曲元数据和歌词，不恢复网易云、QQ、酷狗、波点等音频播放。
- 支持网易云逐字/逐行歌词、翻译与音译（视歌曲收录情况），已知中英文名称及繁简体匹配，以及手动搜索、预览、绑定歌词和歌词文件导入。
- AI 主题保留；无歌词时可按歌曲信息生成。需用户自行配置 AI 服务，未配置时使用封面取色背景。
- 音质、订阅、下载和 AirPlay 由系统“音乐”App 管理。
- Apple 目录搜索默认中国大陆（CN），首次搜索确认地区，可筛选 Apple 官方地区入口列表中的 172 个地区并记住选择；支持 TR（土耳其）。搜索地区不更改账号地区，也不绕过地区版权。
- 资料库与 Apple 目录独立查询，支持分页、按地区缓存、繁简体和常见中英文歌手名辅助查询；不使用网易云音源搜索。

## 安装与首次使用

当前发布的是 **macOS arm64 / Apple Silicon 测试包**，最低系统版本由运行时声明为 macOS 12；未在所有受声明支持的系统版本或另一台实体 Mac 上验证。Intel 构建脚本保留，但本次不发布未经验证的 Intel 包。

1. 下载 DMG，将应用拖进“应用程序”，然后打开。
2. 本版为临时签名、未公证测试版。若 macOS 阻止打开，请核对下载来源，阅读并自行处理系统的“隐私与安全性”提示。不要关闭系统安全保护。
3. 在系统“音乐”中登录自己的 Apple 账号；订阅歌曲需要有效 Apple Music 会员。允许 Folia 控制“音乐”的系统自动化提示。
4. 等待资料库载入，选歌播放。没有加入资料库的目录歌曲可能需要先在“音乐”中加入资料库再刷新。
5. 无歌词或匹配错误时，在歌词面板点放大镜，搜索中文名称或粘贴网易云单曲链接/ID，预览后点“使用此歌词”。

完整说明：[安装与首次使用](release-materials/INSTALL.zh-CN.txt)。

## 已知边界

- 每位用户必须自行完成 macOS 授权与 Apple 登录；安装包不能代替订阅或跳过系统授权。更新临时签名后系统可能再次询问。
- 网易云与 Apple 的收录、地区、译名及版本可能不同，不保证每首歌都有可匹配歌词。网易云限流时暂停请求，稍后重试；也可手动导入歌词。
- 系统“音乐”输出受保护音频，不能作为本地音频交给声部分离、精确波形/节拍分析或音频导出。原有相关代码保留，不能宣传为支持处理 Apple Music 受保护音频。
- 可选模型和 Python 分析运行时不随测试包分发，保留原项目的按需下载流程。
- 本版停用上游更新检查，请从本分支发行页手动更新；不会自动覆盖为原版 Folia。
- 软件为测试版，无零故障承诺；测试范围见 [测试记录](release-materials/TESTING.md)。

## 从源码构建

需要 macOS、Node.js 24 或更新、npm、Git 与网络连接。构建无需 Apple Developer 账号、个人证书或已安装的 Folia。Apple Silicon 建议在原生 arm64 环境构建。

```bash
npm ci
npm run apple:check
npm run apple:dmg
npm run apple:source
```

产物在 `release/apple-music/`。`apple:dmg` 从锁定依赖获取 Electron、FFmpeg 与目标架构 Koffi，生成第三方许可清单、构建并临时签名应用，最后制作和验证只读 DMG。`FOLIA_BUILD_ARCH=x64` 可选择 Intel 构建，必须在对应设备另行验证，不能用 arm64 测试代替。

FFmpeg 的源代码与锁定构建配方由构建脚本获取并校验，随应用提供在 `Contents/Resources/third-party-sources/`；完整源码压缩包也包含它们。所有下载均来自公开上游，不需要发布者的账号数据。源码清单与依赖版本由 `package-lock.json` 固定。

## 发布材料

- DMG、对应源码 ZIP、SHA-256 校验文件。
- [Release 说明](release-materials/RELEASE_NOTES.md)、[安装说明](release-materials/INSTALL.zh-CN.txt)、[测试记录](release-materials/TESTING.md)。
- 原作者署名、AGPL 许可证、原项目 README 和第三方许可清单。

`.github/workflows/apple-music-test-build.yml` 仅支持手动构建并上传 Actions 工件，不自动创建 Release 或发布。原上游工作流保存在 `docs/upstream-workflows/`，不在本分支运行。发布时将源码与 DMG 放在同一 Release，并标记 Pre-release。

不要提交个人配置、API 密钥、账号信息、证书、用户资料库、日志和缓存。发行说明中的功能范围应与本 README 一致。
