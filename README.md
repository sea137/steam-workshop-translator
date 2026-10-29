# 海京Tools · 海京翻译工具

在 **Windows Steam 客户端**内翻译创意工坊标题、介绍、游戏新闻、活动公告正文、更新说明和可选评论，保留原文并标明译文来源。当前版本 **0.3.6**。

**[下载最新版](https://github.com/sea137/steam-workshop-translator/releases/latest)** · [详细安装步骤](docs/INSTALL.md) · [离线模型与翻译源](docs/PROVIDERS.md) · [反馈问题](https://github.com/sea137/steam-workshop-translator/issues)

## 普通玩家下载哪个？

推荐下载 **`HaijingTools-v0.3.6-Windows-WithModel.zip`（含模型完整包）**。

- 包含插件、安装脚本、**英中离线模型**、内置词库及词库 JSON。模型约 67.5 MiB。
- **不用单独下载“题库”或模型，不需要自行安装 Python。** 首次安装仍需联网下载 Millennium 框架（缺少时）和私有运行环境。
- `HaijingTools-v0.3.6-Windows.zip` 是不带模型的轻量包，可在线翻译，也能通过离线安装脚本另行下载模型。
- `Source code (zip)` 是开发源码，不是玩家安装包。

## 安装，照这几步操作

1. 下载 **WithModel.zip**，右键选择 **全部解压**。
2. 从 Steam 左上角菜单选择 **退出**，双击解压目录的 **Install.cmd**。脚本自动识别 Steam 目录；缺少 Millennium 时会从官方下载并校验后安装。
3. 双击 **安装离线翻译.cmd**，等到提示安装完成。它自动使用完整包里的模型，配置私有运行环境，并启动本地服务。
4. 启动 Steam，在 **Steam → Millennium → Plugins** 中启用 **海京Tools**。
5. 打开工坊或游戏库里的更新公告，在右下角 **海京翻译工具 · 0.3.6** 选择 **本地模型（首选推荐）**，点击 **翻译本页**。

首次安装完成后，点击 **本地模型 → 翻译本页** 会自动检查并启动已安装的服务；电脑重启后也可这样使用。手动启动/停止脚本仍可排障和释放内存。不会添加 Windows 开机启动项。

升级用户也运行 Install.cmd 覆盖安装。插件标识、已有缓存和自定义词库保持兼容。当前依赖第三方 Millennium 框架，已验证 3.6.2；它不是 Steam 官方内置功能。

## 翻译源怎么选？

| 翻译源 | 推荐用途 |
| --- | --- |
| **本地模型 · 首选推荐** | 英语到简中，安装后推理不联网，无在线额度限制；模组术语仍可能误译 |
| 自动切换 · 推荐 | **本地模型 → Google → MyMemory → 词库**；在线阶段可能发送所选文字 |
| Google · 备用 | 多语种、自动识别原文语言；公共网页接口可能不可用或限流 |
| MyMemory · 备用 | 英语到简中，免费匿名额度约 5000 字符/天 |
| 本地词库 · 应急 | 完整词条匹配；未命中的整句不会拼凑单词冒充译文 |

面板中的“自动”复选框控制后续页面/动态内容是否自动翻译，和翻译源里的“自动切换”是两个设置。评论需要单独勾选。“还原”移除译文并停止自动翻译，“清缓存”不删除模型或自定义词库。

新闻、公告和更新正文按段落显示中英对照，完成的段落立即出现，不必等待整篇翻完。

工具只翻译 Steam 页面中的**文字**，不识别图片文字，不修改 Mod 内部文件或订阅。

## 模型和词库在哪里？

完整包已经带齐。Release 还单独提供：

- `translate-en_zh-1_9.argosmodel`：原始离线英中模型，用于需要单独补下载的玩家。
- `dictionary-starter.json`：57 条起步词库，默认已内置，不需要再次导入。
- `dictionary-example.json`：自定义词库格式示例；导入支持最多 2 MB / 10000 条。

离线模型装在 `%LOCALAPPDATA%\HaijingTools\offline`。自定义词库保存在 `<Steam>\millennium\config\haijing-dictionary.json`，译文缓存在同目录的 `workshop-translator-cache.json`。只保存本机文件。

## 连续翻译失败 / Steam 无法启动

已装模型后，0.3.6 会在点击本地翻译时检查并启动服务，无需重新下载模型。升级必须运行新版 Install.cmd，将启动辅助文件一并更新；只替换 .star 不足以更新辅助文件。遇到繁忙或超时先等待，避免连续重试或清缓存。

安装后 Steam 无法启动：完全退出 Steam 后，运行「停用海京Tools.cmd」进行插件隔离；「恢复海京Tools.cmd」可撤销。仍无法打开时，再参考 [启动排障](docs/TROUBLESHOOTING.md) 检查 Millennium 框架。仅凭“进不去”无法判断是插件、框架还是联网问题。

## 隐私与错误提示

本地模型和词库模式不调用在线翻译服务。Google/MyMemory 模式会向对应服务发送选中的工坊文字；自动切换可能尝试多个服务。代码不读取 Steam 密码、Cookie、私信或游戏文件。

0.3.1 对每次请求设置总耗时预算，避免多段串行翻译拖过框架的 RPC 等待时限。已完成的结果会保留，RPC 超时和网络错误用中文解释。网络或电脑负载仍可能导致失败，不保证任何在线接口长期可用。

本项目为本地安装的第三方插件，与 Valve 无隶属关系，未上架插件商店。退出 Steam 后运行 Uninstall.cmd 可卸载插件及译文缓存，保留框架、模型和自定义词库。

## 开发与验证

使用 Bun 1.4.4、Starlight 1.1.6：

```text
bun install --frozen-lockfile
bun run typecheck
bun test
bun run build
python -m pip install lupa==2.8
python tests/release_backend_test.py workshop-translator.star
python tests/offline_test.py
python scripts/Fetch-Model.py out/translate-en_zh-1_9.argosmodel
pwsh -File scripts/Pack-Release.ps1 -ModelPath out/translate-en_zh-1_9.argosmodel
```

实际 `.star` 包在 Lua 和 LuaJIT 中验证来源切换、缓存、词库、限流及慢请求预算；页面有交互回归。真实离线模型已验证断网整句/段落/长文本推理。测试环境和客户端页面验收是不同证据，用户实际使用效果以 Steam 为准。

海京维护，开发中使用 Codex 辅助。插件源码与起步词库采用 [MIT](LICENSE)；模型为 Argos 打包的 OPUS-MT en→zh 1.9，原始模型 CC BY 4.0，作者 Jörg Tiedemann、Santhosh Thottingal。CTranslate2、SentencePiece、uv 等许可与署名见 [第三方说明](docs/PROVIDERS.md)。

## 0.3.6 修复与新闻支持

工坊中的近期公告卡片、社区新闻/活动详情、商店游戏新闻页和模组更新说明页面均可使用翻译面板。新闻正文保留原文和链接，译文附在下方；还原按钮可移除译文。隐藏的移动端/桌面端重复摘要不会重复翻译。

修复拖动后缩小窗口或展开帮助导致面板越界的问题，补充新版 SVG 翻页箭头避让；支持拖动、收起和位置复位。

真实 Steam 公告的 3213 字符正文已通过本地模型整篇翻译、8 个链接保留与还原验证。历史 Lua VM AV 报告已保留，本轮独立原生 VM 和客户端复测未复现该历史崩溃，不宣称其根因已排除。
