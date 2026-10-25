# 海京Tools

在 Steam 客户端里直接阅读创意工坊中文译文。

**海京Tools** 是插件名称，目前的功能叫 **海京翻译工具**，后续会继续扩展其他功能。当前版本 **0.2.0**，适用于 **Windows 桌面 Steam**，依赖第三方插件框架 **Millennium**。

**[下载安装包](https://github.com/sea137/steam-workshop-translator/releases/latest)** · [详细安装教程](docs/INSTALL.md) · [更新记录](CHANGELOG.md) · [反馈问题](https://github.com/sea137/steam-workshop-translator/issues)

## 安装

1. 打开下载页，在 **Assets** 下载 `HaijingTools-v0.2.0-Windows.zip`。普通用户不需要下载 `Source code`，也不需要编译。
2. 完整解压 ZIP，从 Steam 菜单选择 **退出**。
3. 双击 **Install.cmd**。脚本自动查找 Steam，缺少框架时从官方 GitHub 下载 Millennium 3.6.2，校验文件后安装。
4. 启动 Steam → 左上角 **Steam → Millennium → Plugins** → 启用 **海京Tools**。
5. 进入创意工坊，在右下角 **海京翻译工具** 面板点击 **翻译本页**。

旧版用户也运行同一个安装程序，再重新打开 Steam 并刷新工坊。插件标识和缓存路径保持兼容，不会另装一个重复插件。

## 功能

- 翻译工坊列表标题、条目介绍及可识别的公告摘要；评论可选，默认关闭。
- 原文保留，中文显示在下方，方便核对机器翻译。
- **自动**：翻译后续页面和动态加载内容，默认关闭。
- **还原**：移除译文、停止当前任务，并关闭自动翻译。
- **清缓存**：清空本机译文缓存、移除译文，并关闭自动翻译。
- **− / ＋**：收起、展开面板。

这是工坊网页文字翻译工具。暂不识别图片文字，不会汉化 Mod 内部文件。专有名词可能误译，请对照原文。

## 速度

0.2.0 每批合并最多 8 段，批内去重，优先处理可见内容，分批显示。缓存每批写入一次，页面扫描减少重复遍历。批量结果严格核对编号；编号异常时退回逐条处理，避免译文配错。

独立 Lua 后端的单次真联网测试中，同样 8 条短文本，0.1.2 为 **8 次请求 / 7.263 秒**，0.2.0 为 **1 次请求 / 0.717 秒**。这是一个网络样本，**不代表固定提速倍数，也不测量 Steam 的界面帧率**。见[测试记录](docs/PERFORMANCE.md)。

## 联网与数据

当前使用 Google 翻译公共网页接口，无需 API Key，**需要网络能访问 `translate.googleapis.com`**。接口可能限流或变化，不能保证长期可用。

点击翻译，或手动开启自动翻译后，所选工坊文字会发送给 Google。只有勾选“包括评论”后才处理评论。插件代码不读取 Steam 密码、Cookie、私信或游戏文件，不修改订阅。

译文缓存在 `<Steam目录>/millennium/config/workshop-translator-cache.json`；开关偏好保存在 Steam 社区网页的本地存储中。

本项目与 Valve 无隶属关系，是本地安装的第三方插件，未经过 Steam Homebrew 插件商店审核，没有商店签名。安装脚本源码、框架下载地址和 SHA256 校验值可查看。

## 卸载

退出 Steam，双击 **Uninstall.cmd**，删除海京Tools 和译文缓存，保留 Millennium 及其他插件。也可先在 Millennium 中禁用海京Tools。框架自身的卸载方式见 [Millennium 官方文档](https://docs.steambrew.app/)。

## 开发

使用 Bun **1.4.4** 和 Starlight **1.1.6**：

```text
bun install --frozen-lockfile
bun run typecheck
bun test
bun run build
pwsh -File scripts/Pack-Release.ps1
```

源码在 `frontend/`、`webview/`、`backend/`；发布文件生成到 `out/`。可选 Lua 后端检查：安装 Python 的 `lupa`，运行 `python tests/backend_test.py`。

已检查类型、14 项 DOM/交互测试、Lua 批量/缓存/异常处理，以及 Chromium 布局和对象返回值回归。用户已确认 0.1.2 在 Steam 中成功显示评论译文；0.2.0 性能数字来自独立 Lua 真联网测试，实际操作感受以客户端为准。

由海京维护，开发过程中使用了 Codex 辅助生成和调试代码。采用 [MIT 许可](LICENSE)。Millennium、Starlight、Google 翻译分别属于各自的项目及服务。

## 反馈

请在 [Issues](https://github.com/sea137/steam-workshop-translator/issues) 提供插件、Steam 和框架版本、公开工坊链接、错误提示及复现步骤。不要提交密码、Cookie、私信或含个人信息的完整日志。
