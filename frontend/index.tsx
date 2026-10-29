import { definePlugin, Field, Router } from 'millennium';
import { watchSteamDocument } from '../webview/lifecycle';

export default definePlugin(() => {
  const documents = new Map<Document, () => void>();
  const syncLibraryWindows = () => {
    const current = new Set<Document>();
    for (const host of Router.WindowStore?.SteamUIWindows || []) {
      const doc = host.BrowserWindow?.document;
      if (!doc?.body || new URL(doc.URL).hostname !== 'steamloopback.host') continue;
      current.add(doc);
      if (!documents.has(doc)) documents.set(doc, watchSteamDocument(doc, {
        translate: text => backend.translateText(text), clearCache: () => backend.clearTranslationCache(),
        translateBatch: (texts, provider) => backend.translateTexts(JSON.stringify({ texts, provider: provider || 'auto' })),
        importDictionary: payload => backend.importDictionary(payload),
        prepareOffline: () => backend.prepareOffline(),
      }));
    }
    documents.forEach((stop, doc) => { if (!current.has(doc)) { stop(); documents.delete(doc); } });
  };
  syncLibraryWindows();
  const timer = setInterval(syncLibraryWindows, 1200);
  return {
    onDismount: () => { clearInterval(timer); documents.forEach(stop => stop()); documents.clear(); },

    title: '海京Tools',
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><text x="1" y="19" fontSize="21">译</text></svg>,
    content: <>
      <Field label="海京翻译工具" description="翻译创意工坊、游戏新闻、活动公告和模组更新说明，支持分批翻译、中英对照和本地缓存。" />
      <Field label="使用方法" description="打开工坊、游戏库更新弹窗、公告详情或游戏新闻，在翻译面板点击「翻译本页」。拖动标题栏可调整位置，缩小窗口会自动保持面板可见。" />
      <Field label="中英对照" description="新闻译文按标题、段落和列表项显示在对应原文下方。图片、作者名称、订阅按钮和链接保持原样。" />
      <Field label="自动翻译" description="在工坊右下角开启「自动」，后续访问和新加载的内容会自动翻译。评论需要另外勾选。" />
      <Field label="翻译源推荐" description="首选推荐本地模型（英语到简中），自动切换也优先本地；Google 适合多语种备用，MyMemory 是限额备用源，本地词库用于词条应急匹配。结果标明来源。" />
      <Field label="离线使用" description="首次运行「安装离线翻译.cmd」安装私有环境与英中模型；以后点击本地翻译会自动检查并启动服务。升级运行新版 Install.cmd 更新辅助文件，已有模型保留。" />
      <Field label="联网与缓存" description="在线模式将所选工坊文字发送给对应服务，自动模式可能发送给 Google 和 MyMemory。本地模型和词库模式不调用在线服务。译文按来源分开缓存在本机。" />
    </>,
  };
});
