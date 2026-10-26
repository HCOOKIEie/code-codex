# Code-Codex v0.5.21

本次正式软件更新覆盖 **v0.5.7 → v0.5.21** 的完整保留变更；期间的本地版本及插件兼容资源发布不另算软件更新。

## 简体中文

- **ASCII Tiles Background（字符玻璃砖）**：新增 WebGL2 背景、字符与玻璃砖外观参数、鼠标按压和回弹、邻砖传播及分组重置。修正交互时整屏淡网格游动、反向回弹和鼠标附近暗影；保留砖面按压效果。加入从网页版移植的对角线逐砖开场动画，打开参数面板不重播背景。
- **统一且各有特色的插件图标**：26 款插件使用不同功能图形，共享描边、尺寸及主题配色，不再重复使用眼睛占位。
- **插件置顶**：每张卡片右上角新增 Pin。各分类内按置顶先后排列，取消后恢复原顺序，重开和升级保留选择；图形采用 50% 不透明度，保持低调且可辨认。
- **启动动画来源**：选择“插件”时可用 ASCII Tiles Background 及 Custom Background 当前图片或视频。启动副本读取已保存参数，拥有独立播放/渲染和资源生命周期，不切换或重启正常背景；视频准备完成后保留播放速度。
- **UI Surface Opacity**：将原“顶部标签栏”明确为“顶部菜单栏”，控制 File/Edit/View/Help/Code-Codex 所在整行。保留原调节值，修正调顶部反而改变对话标题/文件标签底色的区域误判。
- **下载与缓存**：补齐本次更新涉及的精确插件资源，保留独立版本和固定下载地址规则。未改包继续复用匹配缓存；发生内容更新、缺失或损坏的包需要下载对应版本。技术错误和日志继续使用英文。

### 升级与验证范围

EXE/ZIP 用户可在原安装目录更新，保留设置、原素材及匹配的插件缓存，不需要先卸载。MSI 所有权安装继续使用 MSI/Windows Installer 路径。安装会尝试即时激活；没有可信调试端口的官方会话仍需通过 Code-Codex 启动器重新打开，程序不会自动关闭聊天。

已执行相关浏览器/WebGL、参数、启动副本、Pin、Surface 菜单和原生契约回归，并验证当前 Windows 的实际安装、文件校验及可见文件树 ready。部分安装的默认激活观察超过时限，显式重试后确认新版；超时不等于安装文件失败。完整 MSI 升级事务、所有历史版本直升、其它 GPU/Windows 环境及 macOS 尚未逐一实测，不将 fixture 当全平台保证。

## English

This software update covers all retained changes from **v0.5.7 to v0.5.21**. Intermediate local builds and compatibility-resource prereleases are not separate software updates.

- **ASCII Tiles Background:** Adds a WebGL2 background with glyph/glass controls, mouse pressing and rebound, neighboring-tile propagation and grouped resets. Fixes the faint screen-wide moving grid, reverse rebound and dark cursor veil while preserving the pressed glass-face effect. Ports the Web effect's diagonal tile entrance without replaying the background when its settings panel opens.
- **Distinct, consistent plugin icons:** All26 plugins have individual functional artwork with shared outline weight, sizing and theme colors instead of repeated eye placeholders.
- **Plugin pins:** Each card has a top-right Pin. Pinned cards appear first within their category in pin order; unpinning restores catalog order. Choices persist across reopening and upgrades. Glyphs use50% opacity for a quieter appearance.
- **Startup animation sources:** Plugin mode can select ASCII Tiles Background or the currently selected Custom Background image/video. Startup copies read saved parameters and own independent playback/rendering and cleanup, without switching or restarting the normal background. Video playback speed is retained after preparation.
- **UI Surface Opacity:** Renames the existing Tab bar control to Top menu bar and targets the complete File/Edit/View/Help/Code-Codex row. Saved values are retained; conversation titles and file tabs no longer receive this region's backing color.
- **Downloads and caches:** Publishes the exact updated plugin resources while retaining independent package versions and explicitly pinned download addresses. Unchanged matching caches are reusable; changed, missing or corrupt packages require their corresponding version. Technical errors and logs remain English.

### Upgrade and validation limits

EXE/ZIP users can update in the existing installation directory without uninstalling; settings, original media and matching plugin caches are retained. MSI-owned installations must continue through MSI/Windows Installer. Installation attempts live activation. An official session without a verified debugging listener must still be reopened through the Code-Codex launcher; chats are not terminated automatically.

Relevant browser/WebGL, options, startup-copy, Pin, Surface-menu and native-contract regressions were exercised, along with actual installation, file hashes and a visible ready tree on the current Windows machine. Some default activation observations timed out and were subsequently confirmed through an explicit retry; this is distinct from file-installation failure. Complete MSI upgrades, every historical direct upgrade, other GPU/Windows environments and macOS have not all been physically tested. Fixtures do not establish universal platform coverage.

## Downloads / 下载

- `CodeCodex-0.5.21-x64-setup.exe`
- `CodeCodex-0.5.21-x64.msi`
- `CodeCodex-0.5.21-x64.zip`
- `Uninstall-CodeCodex.exe`
- `CodeCodex-plugin-catalog-0.5.21.json`
- `SHA256SUMS.txt`

插件依据 catalog 中各自的精确 tag 下载。v0.5.15、v0.5.18、v0.5.19 的兼容资源预发布仅补齐这些固定地址，不包含完整软件安装包，也不是额外软件更新。GitHub 自动生成的 Source code 归档与上述六项手动上传附件分开。

Plugins download from their exact catalog tags. Compatibility-resource prereleases at v0.5.15, v0.5.18 and v0.5.19 only supply those fixed asset addresses, contain no software installer and are not additional software updates. GitHub's automatic Source code archives are separate from the six uploaded assets above.
