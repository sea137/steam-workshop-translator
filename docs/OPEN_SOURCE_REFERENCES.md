# 开源翻译项目参考记录

核对日期：2026-10-30。本文件记录已阅读的设计、海京Tools 的对应位置和待验证的改进方向，不表示这些能力已全部实现。

## 来源与边界

- [KISS Translator](https://github.com/fishjar/kiss-translator)，核对 dev 分支提交 576906e58be98b01e8b6d959efd5b38e01b2d355。已阅读 README、[批量队列](https://github.com/fishjar/kiss-translator/blob/576906e58be98b01e8b6d959efd5b38e01b2d355/src/libs/batchQueue.js)、其取消回归测试以及 translator.js 的段落调度部分。
- [FluentRead](https://github.com/FluentRead/FluentRead)，原 Bistutu/FluentRead 地址已重定向，核对 main 分支提交 11d6a055a6ab87321651840d68c97e162b6e4ae6。已阅读 README、[全文队列](https://github.com/FluentRead/FluentRead/blob/11d6a055a6ab87321651840d68c97e162b6e4ae6/src/features/full-page-translation/content/fullPageQueue.ts)、[视口稳定性](https://github.com/FluentRead/FluentRead/blob/11d6a055a6ab87321651840d68c97e162b6e4ae6/src/features/full-page-translation/content/viewportStability.ts) 和本地 Worker 应用入口。

两者仓库声明 GPL-3.0。本次没有复制源码或引入依赖，也没有改动海京Tools现有许可证。后续若直接引入代码，应在具体变更中处理许可证、来源与署名；不能把复制的 GPL 实现作为未注明来源的自有代码发布。

它们的浏览器扩展运行环境与 Steam/Millennium 不同。浏览器后台、Offscreen、Worker 和扩展消息机制需要适配，不能仅改入口就保证可用。

## 值得采用的设计

| 优先级 | 参考设计 | 海京Tools 对应位置与当前状态 | 验证标准 |
| --- | --- | --- | --- |
| P0 | 明确区分模型文件与运行状态、启动失败可恢复 | 0.3.6 已独立完成 prepareOffline 与按需启动；用户已确认实际翻译正常。进一步可增加常驻状态诊断 | 服务未运行时能拉起；启动调用能返回；严格本地模式不发送在线请求 |
| P1 | KISS 按服务与配置复用队列，取消排队任务时不破坏其他调用的结果对应 | translator.ts 目前每面板单独 busy/epoch，服务端单推理槽拒绝并发；跨面板协调仍未实现 | 多窗口连续切换不形成重复请求；旧任务不覆盖新页面；合并请求中取消一个不会错配其他结果 |
| P1 | FluentRead 对可见内容派发、布局集中读取、排队公平性 | 当前只在一次运行开始按几何排序；未实现动态可见区调度与后台公平配额 | 首屏优先完成；滚动后新可见内容优先；不会无限饿死剩余段落 |
| P1 | 段落失败只登记重试意图，再经过已有队列限制 | 当前一批部分失败会保留成功结果，但随后停止本轮；逐段重试仍待实现 | 单段失败不清掉已完成译文；重试不会绕过并发/限流约束；连续点击不重复入队 |
| P1 | FluentRead 在译文插入/还原时维护实际滚动容器中的阅读锚点 | 当前有面板位置和段落对照，尚无正文阅读锚点补偿 | 在 Steam 公告内层滚动容器插入上方译文时，正在读的原文不会明显跳动；还原后位置合理 |
| P2 | 服务适配统一输入/输出及缓存键，术语和上下文可配置 | 现有 Google/MyMemory/本地/词库已按来源缓存；未来接口配置、段落术语映射未实现 | 切换来源、目标语言或模型配置后不会误用旧缓存；专有名称规则可撤销 |

## 当前改动与后续改动分开

0.3.6 是针对实际反馈完成的独立修复：按需检查并启动已安装服务、等待就绪、可取消、固定路径脚本、关闭继承输出句柄。它不包含这份记录中的后续队列/阅读锚点/术语功能。

前端丢弃旧结果不等于原生 HTTP 或本地模型已停止计算。在实现真正中止协议以前，不应把 UI 取消描述成“已终止模型推理”。

DNS_PROBE_FINISHED_NXDOMAIN 的玩家报告仍缺少实际出错域名和隔离结果；这些项目不能直接证明海京Tools、Millennium 或 SteamCommunity 302 中哪一层引起故障。继续保留可撤销停用方法，按相同页面逐层比较。
