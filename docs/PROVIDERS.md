# 翻译源与离线使用

工坊面板的“翻译源”下拉框提供：

| 选项 | 使用方式 | 范围与限制 |
| --- | --- | --- |
| 自动切换 | 缓存优先，本地模型 → Google → MyMemory → 本地词库 | 在线阶段可能向 Google 和 MyMemory 发送所选文字 |
| Google | 仅使用 Google 及其缓存 | 自动识别原文语言；公共网页接口可能限流或变化 |
| MyMemory | 仅使用 MyMemory 及其缓存 | 本版英语 → 简中；匿名免费额度约 5000 字符/天，不适合持续大量翻译 |
| 本地模型 | 只调用本机 `127.0.0.1:17653` 及该来源缓存 | 需安装并启动模型；本版英语 → 简中；推理不联网 |
| 本地词库 | 内置词条 + 用户导入的完整词条 | 不联网；未命中不会拼凑单词冒充整句译文 |

**“自动”复选框**表示自动翻译新页面/新加载内容；**“自动切换”翻译源**表示请求失败时尝试下一来源，两者是不同设置。

结果旁会标明来源，词库结果显示“词库匹配”。切换来源会移除当前显示结果，点击“翻译本页”重新应用；各来源缓存隔离。清缓存不会删除自定义词库或模型。

## 最简单的离线安装方法

1. 完整解压 Windows 安装包，双击 **安装离线翻译.cmd**，等待提示安装成功。首次会下载私有运行环境和模型，不需要自行安装 Python，也不修改系统 PATH。
2. 回到工坊，在“翻译源”中选 **本地模型**，点击“翻译本页”。
3. 重启电脑后，双击 **启动离线翻译.cmd**，再使用本地模式。退出游戏仍可使用；不随 Windows 自动启动。用 **停止离线翻译.cmd** 可释放模型占用。

模型包为 Argos 英中 1.9，约 **67.5 MiB / 70.7 MB**；Python、推理引擎等另需下载，完整初次安装所需空间更大。安装目录为 `%LOCALAPPDATA%\HaijingTools\offline`。只支持 64 位 Windows，模型在 CPU 上运行，速度取决于电脑配置；机器翻译可能误解 Mod 术语。

运行服务只监听本机回环地址，拒绝带浏览器 Origin 的请求，没有文件、命令执行或模型下载的 HTTP 接口。安装只通过单独的本地安装脚本完成，不会自动打开公网端口。

若模型下载被系统代理拒绝，脚本会对同一官方下载地址尝试一次直接 TLS 连接，不改变系统、Steam 或代理软件设置。UV 和模型包均校验固定 SHA256。下载失败可重新运行；不会以失败页面代替模型。

也可从下面的官方地址另行下载模型，然后运行：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\offline\Install-Offline.ps1 -ModelPath 'D:\Downloads\translate-en_zh-1_9.argosmodel'
```

- [官方 Argos 模型目录](https://github.com/argosopentech/argospm-index)
- [官方英中模型下载](https://argos-net.com/v1/translate-en_zh-1_9.argosmodel)
- 模型 SHA256：`433e7c4f034d87fbe2353161e05f18646d7999452f801a4e1f0378522b9850ab`

插件卸载保留模型和自定义词库，避免删除自行维护的数据。若不再需要离线引擎，先运行停止脚本，然后在资源管理器删除上述 `HaijingTools\offline` 文件夹即可。

## 导入自己的词库

展开工坊面板的 **离线模型 / 导入词库**，点击 **导入本地词库**，选择 JSON 文件。可以使用安装包的 `dictionary-example.json` 作为模板：

```json
{
  "entries": {
    "Field Tents": "野外帐篷",
    "This mod is compatible with existing saves.": "此模组兼容已有存档。"
  }
}
```

也支持直接的 `{"原文":"译文"}` 映射。最大 2 MB、10000 条。导入替换上次自定义词库，内置词条保留。英文大小写与多余空格不影响匹配，整句和标点仍需对应。

自定义词库保存在 `<Steam>\millennium\config\haijing-dictionary.json`，仅本机读取。词库模式没有命中的句子会保留原文并提示。网上下载的任意词库需要先转换成此 JSON 格式，不能直接导入二进制词典、模型或脚本。

## 服务限制与来源

浏览器内置翻译属于浏览器集成功能，不能直接作为 Steam 插件接口使用。微软公开 Translator API 需要自己的认证，本版没有提取浏览器 Cookie/令牌，也不宣传“免费无限微软翻译”。

MyMemory 使用官方公开 `get` 接口；请求遵守 500 字节限制，自动按 UTF-8 字符边界拆分。额度耗尽、429、无效返回不会被当成译文缓存。自动切换也不代表所有服务永远可用。

- [MyMemory 接口与单次限制](https://mymemory.translated.net/doc/spec.php)
- [MyMemory 免费额度](https://mymemory.translated.net/doc/usagelimits.php)
- [微软 Translator API](https://learn.microsoft.com/en-us/azure/ai-services/translator/text-translation/reference/v3/translate)
- [CTranslate2](https://opennmt.net/CTranslate2/)
- [Argos Translate](https://github.com/argosopentech/argos-translate)

## 第三方署名

本地推理使用 CTranslate2（MIT）与 SentencePiece（Apache 2.0）。运行环境通过 uv（MIT / Apache 2.0）管理。模型使用 Argos 打包的 OPUS-MT English–Chinese 1.9，原始模型许可为 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)；作者 Jörg Tiedemann、Santhosh Thottingal，论文 “OPUS-MT — Building open translation services for the World”, EAMT 2020。模型下载包中的 README 及运行库许可随下载保留。本插件源码的 MIT 许可不替代这些第三方许可。

## 0.3.1 玩家补充

首选推荐本地模型，自动模式也优先本地。推荐下载 WithModel 完整包，里面已经有离线模型和词库，不用另找“题库”。完整解压后依次运行 Install.cmd、安装离线翻译.cmd；首次仍需联网下载运行环境。下次重启电脑后运行启动离线翻译.cmd。
