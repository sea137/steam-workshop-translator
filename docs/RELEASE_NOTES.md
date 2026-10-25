海京Tools 0.3.1：本地翻译优先，错误提示中文化，修复慢请求超出框架 RPC 等待时限。

**普通玩家推荐下载 `HaijingTools-v0.3.1-Windows-WithModel.zip`（含模型完整包）。**

- 翻译源带推荐说明：本地模型首选；自动切换按本地模型 → Google → MyMemory → 词库尝试。
- 每次请求设总耗时预算，缩小本地 / MyMemory 批次，保留已完成结果；RPC 超时、网络失败、限流等显示中文。
- 完整包已经包含约 67.5 MiB 的英中离线模型与 57 条起步词库，不用另找“题库”。
- 同时提供轻量包、单独模型 `translate-en_zh-1_9.argosmodel` 和 `dictionary-starter.json`，方便补下载或编辑。

**安装：** 全部解压 → 退出 Steam → 运行 Install.cmd → 运行“安装离线翻译.cmd” → 启动 Steam 并在 Millennium / Plugins 启用海京Tools → 工坊选择“本地模型（首选推荐）”。

首次仍需联网下载框架（缺少时）和私有运行环境，不用自己配置 Python。下次电脑开机后运行“启动离线翻译.cmd”。模型已安装后推理不联网，英语到简中，术语可能误译。

Google 为可能变化的公共接口，MyMemory 英中匿名免费额度约 5000 字符/天。自动模式可能向在线服务发送所选文字。

模型来自官方 Argos 包，原始 OPUS-MT 模型 CC BY 4.0，作者 Jörg Tiedemann、Santhosh Thottingal；模型包 README 与第三方说明保留署名。模型 SHA256：433e7c4f034d87fbe2353161e05f18646d7999452f801a4e1f0378522b9850ab。

完整步骤见仓库 README、docs/INSTALL.md 和 docs/PROVIDERS.md。
