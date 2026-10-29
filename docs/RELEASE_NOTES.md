海京Tools 0.3.7：分段重试与阅读体验。

- 某段失败后，后面的内容继续翻译。原文下方显示中文错误和「重试此段」，保留已有译文与成功分片。
- 同一前端运行环境中的多个 Steam 文档共用请求队列；取消后移除排队任务，已发出的原生请求结束后才释放槽位。不同 WebKit 环境仍由服务端单推理槽保护。
- 每批更新可见区优先级，并定期处理较早排队的内容；插入译文和还原时补偿实际滚动容器中的阅读位置。
- 新增面板内「遇到错误？反馈前请截图」、安装包《问题反馈须知》和详细反馈模板。提供完整截图、版本、翻译源、页面地址及步骤，遮住账号与密钥。

感谢 [KISS Translator](https://github.com/fishjar/kiss-translator) 和 [FluentRead](https://github.com/FluentRead/FluentRead) 的设计启发，按 Steam 环境独立实现，未复制其 GPL 源码；核对记录见 docs/OPEN_SOURCE_REFERENCES.md。

新用户推荐下载 **HaijingTools-v0.3.7-Windows-WithModel.zip**，完整解压后先安装 Millennium，再运行 Install.cmd 并启用海京Tools，首次运行「安装离线翻译.cmd」配置运行环境。完整包已包含模型和起步词库，不用另找“题库”；首次配置运行环境仍需联网。

旧用户运行新版 Install.cmd 升级，已有模型保留。完成首次配置后，点击本地翻译会按需启动服务，不添加系统开机项。

本次不代表已确诊或解决所有玩家的 Steam 启动和 DNS 故障。请提供实际截图与域名，按 docs/TROUBLESHOOTING.md 可撤销停用并对照检查。
