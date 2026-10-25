# 海京Tools 安装教程

适用：Windows 桌面 Steam。当前功能：海京翻译工具。

## 第一次安装

1. 打开 [Releases 下载页](https://github.com/sea137/steam-workshop-translator/releases/latest)。
2. 在 **Assets** 下载 **HaijingTools-v0.2.0-Windows.zip**。`Source code (zip)` 是源码，不是普通用户安装包。
3. 右键 ZIP → **全部解压**，不要在压缩包里直接运行。
4. Steam 左上角菜单 → **退出**，不要只关闭窗口。
5. 双击解压目录里的 **Install.cmd**。
6. 启动 Steam → **Steam → Millennium → Plugins** → 启用 **海京Tools**。
7. 打开工坊，右下角应显示 **海京翻译工具 · 0.2.0**，点击 **翻译本页**。

缺少框架时，安装脚本会下载官方 Millennium **3.6.2** 发行文件并核对 SHA256。已有框架保留。下载框架需要访问 GitHub，翻译需要访问 Google。

## 已有 Millennium，手动安装

退出 Steam，将 ZIP 内 `workshop-translator.star` 复制为：

```text
<Steam安装目录>\millennium\plugins\local.workshop.translator.star
```

重新启动 Steam，在 Millennium 的 Plugins 列表启用海京Tools。

也可先用 [Millennium 官方安装器](https://docs.steambrew.app/users/getting-started/installation) 安装框架。海京Tools 未上架插件商店，不能按商店 ID 搜索安装。

## 控件

| 控件 | 作用 |
| --- | --- |
| 翻译本页 | 分批翻译，已完成的内容逐批显示 |
| 自动 | 翻译后续页面及新加载内容，默认关闭 |
| 包括评论 | 翻译可识别的评论，默认关闭 |
| 还原 | 移除译文、停止任务，并关闭自动翻译 |
| 清缓存 | 清空缓存及译文，下次重新获取 |
| − / ＋ | 收起、展开面板 |

每轮最多处理 160 处文字，可再次点击继续。相同原文优先使用本地缓存。

## 更新和卸载

更新：下载新版、完整解压、退出 Steam、运行 Install.cmd，再重新打开 Steam 并刷新工坊。面板标题应显示新版版本号。

卸载：退出 Steam，运行 **Uninstall.cmd**，删除插件及缓存，保留框架和其他插件；也可先在 Plugins 中禁用海京Tools。

## 常见问题

**没有面板？** 确认使用的是 Steam 客户端，插件已启用，页面是工坊或工坊详情；重启 Steam，再刷新工坊。

**连接失败 / 很慢？** 当前依赖 Google 公共翻译接口。检查网络是否能访问 Google；接口可能限流。0.2.0 减少请求次数，但不能解决网络不可达。

**图片或 Mod 内部还是外文？** 暂不支持图片文字识别，也不会汉化 Mod 内部文件。

**Steam 仍在运行？** 从 Steam 菜单退出并等客户端完全结束。脚本不会强制结束 Steam 或游戏。

**拒绝访问？** 需要 Steam 目录写入权限。目录受保护时，可在确认脚本来源后以管理员身份运行 Install.cmd；不要关闭安全软件或改动系统安全设置来安装。

**已有 wsock32.dll 冲突？** 脚本会停止，避免覆盖其他工具。请核对原文件来源，或用 Millennium 官方安装器处理框架安装。

**自动找不到 Steam？** 按手动安装步骤复制文件，或对 Install.ps1 传入 `-SteamPath '实际Steam目录'`。所选目录内应能找到 steam.exe。
