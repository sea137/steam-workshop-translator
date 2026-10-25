# 哔哩哔哩发布文案

以下是草稿，可直接修改后使用；未替你发布到哔哩哔哩。

## 推荐标题

**Steam 创意工坊看不懂？我做了个中文翻译工具，客户端里直接用！**

备选：

- 给 Steam 工坊加上中文翻译：标题、介绍、评论都能对照看
- 海京Tools 首发：在 Steam 客户端里一键翻译创意工坊
- 不用复制外文评论了！Steam 工坊中文翻译工具分享

## 封面文字

主标题：**Steam 工坊，一键看中文**

副标题：**标题 / 介绍 / 评论 · 原文对照**

角标：**海京Tools · 安装教程**

封面用真实翻译前后对照最清楚，显示一条英文评论和对应中文即可。录屏、截图前遮住 Steam 账号信息和无关聊天；不要把它做成 Valve 官方功能的样式。

## 约 90 秒口播稿

经常逛 Steam 创意工坊的朋友，应该都遇到过这种情况：Mod 看起来挺有意思，但介绍和评论一大段外文，看起来有点费劲。

所以我做了一个小工具，叫海京翻译工具，放在我自己的 Steam 插件“海京Tools”里面。以后还会继续加其他功能。

它直接在 Steam 客户端里用。打开工坊，点右下角“翻译本页”，中文就会显示在原文下面。标题、介绍，还有勾选后的评论，都能这样对照着看。

原文不会消失，链接和订阅按钮照常使用。看完想恢复，点“还原”就行；也可以按需要开启自动翻译。

这次还改了翻译速度：把多个短文本合并请求，优先显示眼前的内容，重复文字走缓存。不过第一次翻译仍然要联网，具体快慢取决于网络和翻译服务。

安装包和源码都放在 GitHub 了。下载 Releases 里的 Windows 安装包，解压，退出 Steam，再运行 Install。然后到 Steam 的 Millennium 插件列表里启用海京Tools，就可以用了。

最后说两个前提：它需要第三方 Millennium 框架，安装脚本会帮你安装；当前调用 Google 翻译，需要网络能访问 Google，不用填 API Key。

它翻译的是工坊网页文字，图片里的外文和 Mod 游戏内的文本不在这个功能里。机器翻译也可能有误，建议对照原文看。

下载和教程链接放在简介，有问题可以到 GitHub 提交反馈。

## 录屏分镜

| 时间 | 画面 | 重点 |
| --- | --- | --- |
| 0–8 秒 | 工坊英文介绍或评论 | 先展示实际阅读场景 |
| 8–25 秒 | 点击翻译，中文逐批出现 | 放大“原文 + 译文” |
| 25–40 秒 | 勾选评论、点还原、收起面板 | 演示可控、可还原 |
| 40–60 秒 | Releases → ZIP → 解压 → Install.cmd | 提醒下载 Assets 安装包 |
| 60–75 秒 | Millennium Plugins 启用海京Tools | 同时标出插件名和工具名 |
| 75–90 秒 | 回到工坊翻译，显示下载链接 | 明确框架、Google 网络及范围 |

## 视频简介（可直接复制）

给 Steam 创意工坊做了个中文翻译小工具：海京翻译工具，现在收录在我的插件「海京Tools」里。

支持工坊标题、介绍，以及按需勾选的评论翻译。中文放在原文下方，方便对照；支持自动翻译、缓存和一键还原。

下载：https://github.com/sea137/steam-workshop-translator/releases/latest
源码：https://github.com/sea137/steam-workshop-translator
安装教程：https://github.com/sea137/steam-workshop-translator/blob/main/docs/INSTALL.md
反馈：https://github.com/sea137/steam-workshop-translator/issues

安装步骤：下载 Releases → Assets 中的 Windows ZIP → 完整解压 → 退出 Steam → 运行 Install.cmd → 启动 Steam，在 Millennium → Plugins 中启用海京Tools。

使用前提：Windows 桌面 Steam；第三方 Millennium 框架；能访问 Google 翻译的网络。无需 API Key。首次安装框架需要访问 GitHub。

目前翻译的是工坊网页文字，不识别图片，也不汉化 Mod 内部文件。机器翻译有误差，请对照原文。本项目不是 Valve 官方功能。

由海京维护，开发使用了 Codex 辅助。后续计划给海京Tools 增加更多实用功能，具体以更新记录为准。

## 置顶评论

下载放这里：https://github.com/sea137/steam-workshop-translator/releases/latest

请下载 **Assets 里的 HaijingTools-v0.2.0-Windows.zip**，普通用户不用下载 Source code。解压后退出 Steam，运行 Install.cmd；重新打开 Steam，到 Millennium → Plugins 启用「海京Tools」。工坊右下角的功能面板叫「海京翻译工具」。

连接失败先检查当前网络能否访问 Google。反馈请带上插件版本、公开工坊链接和错误截图，注意遮住账号信息。

## 标签候选

Steam、创意工坊、游戏工具、开源、翻译工具、RimWorld、海京Tools。

## 对外描述口径

- 可以说“免费开源、无需 API Key、客户端内使用”；不要承诺翻译服务永久免费或永远可用。
- 可以说“减少请求次数、批量翻译”；不要把一次网络样本写成“永久十倍加速”。
- 不把网页翻译宣传为“所有 Mod 自动汉化”。
- 不承诺全游戏、全页面、全网络环境都适配，也不作未经验证的账号安全承诺。
