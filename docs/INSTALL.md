# 玩家安装教程

推荐从 [Releases](https://github.com/sea137/steam-workshop-translator/releases/latest) 下载 **HaijingTools-v0.3.4-Windows-WithModel.zip**。这是含离线模型的完整包，普通玩家不要选 Source code。

## 第一次安装

1. 右键下载的 ZIP → **全部解压**。
2. 从 Steam 菜单选择 **退出**，双击 **Install.cmd**。
3. 双击 **安装离线翻译.cmd**，等待自动配置完成。完整包的模型会自动读取，不必另下模型或词库；首次要联网下载私有 Python / 推理引擎。若缺少 Millennium，第二步会下载安装官方 3.6.2 框架并校验 SHA256。
4. 启动 Steam → **Steam → Millennium → Plugins** → 启用 **海京Tools**。
5. 打开工坊，看到 **海京翻译工具 · 0.3.4** 后，在翻译源选择 **本地模型（首选推荐）**，点击 **翻译本页**。评论需要勾选“包括评论”。

下次电脑重启后，双击 **启动离线翻译.cmd**。不使用时运行 **停止离线翻译.cmd**。模型只处理英中；其他语言可用 Google 备用源。机器翻译不能保证专有名词准确。

## 下载项有什么区别？

| 文件 | 用途 |
| --- | --- |
| Windows-WithModel.zip | 推荐完整包，带模型与词库 |
| Windows.zip | 轻量包，不含模型；离线安装脚本会另行下载 |
| translate-en_zh-1_9.argosmodel | 单独模型补下载，不是可执行程序 |
| dictionary-starter.json | 默认已内置的 57 条起步词库，可自行编辑 |
| workshop-translator.star | 已装 Millennium 的高级用户手动覆盖插件 |
| Source code | 开发者源码 |

仅在线翻译可省略离线安装步骤。单独下载模型后，可以用 `offline/Install-Offline.ps1 -ModelPath 模型完整路径` 指定；完整包无需此操作。

## 常见问题

**是不是还要下载“题库”？** 不用。这里的模型负责整句翻译，词库只匹配已有词条。推荐完整包已经同时提供。自定义词库可在面板展开“离线模型 / 导入词库”，选择 JSON 文件导入，参考 dictionary-example.json。

**为什么仍要首次联网？** 完整包内含模型，框架和私有运行环境仍需按需下载安装。不用自己安装 Python；第一次装好后，本地模型推理不联网。

**错误写着超时？** 新版会显示中文。优先选择本地模型；确认本地服务已启动。若插件后端持续不响应，退出并重新打开 Steam。不要连续重试或清缓存。

**找不到 Steam？** 安装器读取当前用户 Steam 注册表路径，并检查 steam.exe；可手动执行 `Install.ps1 -SteamPath 'D:\Steam' -InstallFramework`。不要填游戏库目录。

**没有 Millennium 菜单？** 从 Steam 菜单真正退出再启动；确认框架已安装。详细步骤、模型下载校验和第三方许可见 [离线说明](PROVIDERS.md)。

## 更新与卸载

退出 Steam，再运行新包的 Install.cmd 覆盖更新，已有模型和自定义词库保留。卸载运行 Uninstall.cmd，只删除本插件与译文缓存；框架、模型和词库保留。要删除模型，先运行停止脚本，再在资源管理器删除 `%LOCALAPPDATA%\HaijingTools\offline`。

## 新闻与更新公告

除了工坊条目，还可在游戏新闻、活动公告详情、商店游戏新闻及模组更新说明页面点击翻译。使用旧版缓存页面时，请刷新或重新打开页面，确认面板版本 0.3.4。长公告会分段调用模型，最后在原文下方显示完整译文，链接仍可使用。
