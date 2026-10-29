# 离线翻译与 Steam 启动排障

## 本地模型提示失败

- **未连接到服务**：先运行「启动离线翻译.cmd」。这不代表模型文件丢失，也不需要马上重新下载模型。启动失败时保留窗口里的错误文字。
- **繁忙**：前一批推理尚未结束。稍等再试，避免连续点击或清缓存。
- **超时**：本批未在等待时间内完成，服务可能仍在计算。先等待；持续超时可用新版包的「停止离线翻译.cmd」停止服务，再启动。
- **推理失败**：停止并重新启动服务；仍失败时提供 `%LOCALAPPDATA%\HaijingTools\offline\server-error.log`。分享日志前检查是否有个人路径等信息。

0.3.5 升级服务：运行新版包里的停止脚本，再运行启动脚本。启动脚本会复制新版 `server.py` 到私有环境，已有模型和环境保留。

## 安装后 Steam 无法打开

先区分：完全没有窗口/闪退，还是有窗口但无法登录/联网。不要直接把两者都归因于加速器。

1. 完全退出 Steam；若没有窗口却残留进程，可在任务管理器结束 Steam。
2. 从本安装包运行「停用海京Tools.cmd」，再启动 Steam。该脚本将本插件改名备份，不动游戏、模型、Millennium 或其他插件。
3. 若恢复了，保持海京Tools停用，并反馈版本、错误截图以及 Millennium 日志。运行「恢复海京Tools.cmd」可以撤销停用。
4. 若仍打不开，还需隔离框架本身。按 [Millennium 官方 Windows 卸载说明](https://docs.steambrew.app/users/parting-ways/uninstall)，使用其官方安装器卸载 Millennium，再测试原生 Steam。此步骤会影响框架下其他插件，不是停用海京Tools。
5. 如果原生 Steam 仍打不开，再按 [Steam 官方客户端排障](https://help.steampowered.com/en/faqs/view/29A6-F529-F956-6292) 继续检查。

Millennium 官方说明提到首次设置网络、框架/插件兼容以及 Steam 测试版界面变动等可能性，见 [官方排障说明](https://docs.steambrew.app/users/getting-started/troubleshooting)。这些是排查方向，不是对某位玩家故障的确诊。

## 安装包旧版本没有停用脚本

Steam 完全退出后，可先运行旧包里的 `Uninstall.cmd`，只卸载海京Tools。若需可撤销停用，使用 0.3.5 及更新包的停用/恢复脚本；不必先运行安装程序。


## DNS_PROBE_STARTED / DNS_PROBE_FINISHED_NXDOMAIN

这两个错误名不能给出具体失败的域名。请保留包含 Steam 地址栏的完整错误页面截图；B站把错误文字生成的搜索链接不是 Steam 出错地址。

SteamCommunity 302 作者说明其部分模式会修改 hosts 或重定向 DNS，因此它属于需要隔离检查的网络组件；不能仅凭装了两个工具就认定存在兼容冲突。来源：https://www.dogfight360.com/blog/18682/amp/

保持 302 的设置不变，先完全退出 Steam，用本包「停用海京Tools.cmd」只停用海京Tools，再重开同一页面。如果恢复，保留版本和错误信息供继续定位；如果仍失败，继续按上面的官方方法隔离 Millennium 框架。若需要单独测试 302，应在其软件内正常停止服务并使用相同页面比较，不要直接删除其文件或盲目修改系统 DNS/hosts。

0.3.6 本地服务按需启动只访问 127.0.0.1，不依赖社区站点 DNS。它解决离线服务未运行的使用问题，不代表解决了玩家尚未确诊的 DNS 故障。
