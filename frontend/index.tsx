import { definePlugin, Field } from 'millennium';

export default definePlugin(() => ({
  title: '海京Tools',
  icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><text x="1" y="19" fontSize="21">译</text></svg>,
  content: <>
    <Field label="海京翻译工具" description="海京Tools 的创意工坊翻译功能，支持分批翻译、中英对照和本地缓存。" />
    <Field label="使用方法" description="打开任意游戏的创意工坊，在右下角点击「翻译本页」。" />
    <Field label="中英对照" description="译文显示在原文下方。图片、作者名称、订阅按钮和链接保持原样。" />
    <Field label="自动翻译" description="在工坊右下角开启「自动」，后续访问和新加载的内容会自动翻译。评论需要另外勾选。" />
    <Field label="在线翻译与缓存" description="选中的工坊文字会发送到 Google 翻译公共接口，无需 API Key。译文缓存在本机，可在工坊面板清空。接口可能限流，网络需能访问 Google。" />
  </>,
}));
