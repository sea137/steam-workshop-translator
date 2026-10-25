// Millennium may decode a backend JSON string before passing it to WebKit.
export type Translate = (text: string) => Promise<unknown>;
export type TranslateBatch = (texts: string[], provider?: string) => Promise<unknown>;
type Tools = { importDictionary: (payload: string) => Promise<unknown> };
const SOURCES: Record<string, string> = { offline: '本地模型', auto: '自动切换', google: 'Google', mymemory: 'MyMemory', dictionary: '本地词库' };
const OWN = '[data-swt-owned]';
const PREFS = 'swt.preferences.v1';

function userError(error: unknown): string {
  const raw = typeof error === 'string' ? error : error && typeof error === 'object' && 'message' in error
    ? String(error.message) : '';
  if (/RPC.*timeout|timed?\s*out|timeout/i.test(raw))
    return '翻译等待超时，已保留完成的结果。建议优先选择「本地模型」；若持续出现，请重启 Steam 和离线翻译服务。';
  if (/429|too many requests|rate.?limit/i.test(raw) && !/[\u4e00-\u9fff]/.test(raw))
    return '翻译服务暂时限流，请稍后重试，或切换到本地模型。';
  if (/RPC|child.*(?:exit|crash)|backend.*(?:unavailable|not.*running)|Millennium Error/i.test(raw))
    return '翻译插件后端暂未响应，请重启 Steam 后再试。';
  if (/fetch|network|connection|resolve|SSL|certificate/i.test(raw) && !/[\u4e00-\u9fff]/.test(raw))
    return '翻译服务连接失败，请检查网络，或切换到本地模型。';
  return /[\u4e00-\u9fff]/.test(raw) ? raw : '翻译失败，请稍后重试或切换翻译源。';
}

function responseObject(value: unknown): Record<string, unknown> {
  let payload: unknown = value;
  if (typeof payload === 'string') {
    try { payload = JSON.parse(payload); }
    catch { throw new Error('翻译服务返回格式异常，请稍后重试。'); }
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload))
    throw new Error('翻译服务返回格式异常，请稍后重试。');
  return payload as Record<string, unknown>;
}

function translationText(value: unknown): string {
  const response = responseObject(value);
  if (response.ok !== true)
    throw new Error(typeof response.error === 'string' ? response.error : '翻译服务未返回文字。');
  if (typeof response.text !== 'string' || !response.text.trim())
    throw new Error('翻译服务未返回文字。');
  return response.text;
}

export function isWorkshopURL(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && u.hostname === 'steamcommunity.com' &&
      (/^\/app\/\d+\/workshop(?:\/|$)/.test(u.pathname) ||
       /^\/workshop(?:\/|$)/.test(u.pathname) ||
       /^\/sharedfiles\/filedetails\/?$/.test(u.pathname));
  } catch { return false; }
}

// Iterate Unicode code points so a surrogate pair never splits across requests.
export function splitText(text: string, limit = 1100): string[] {
  const chars = Array.from(text);
  const parts: string[] = [];
  for (let offset = 0; offset < chars.length;) {
    let end = Math.min(offset + limit, chars.length);
    if (end < chars.length) {
      const tail = chars.slice(offset, end).join('');
      const boundary = Math.max(tail.lastIndexOf('\n'), tail.lastIndexOf('. '), tail.lastIndexOf('。'));
      if (boundary > limit / 2) end = offset + Array.from(tail.slice(0, boundary + 1)).length;
    }
    parts.push(chars.slice(offset, end).join(''));
    offset = end;
  }
  return parts;
}

export function originalText(element: Element): string {
  const clone = element.cloneNode(true) as Element;
  clone.querySelectorAll(`${OWN},script,style,textarea,pre,code,button,input,select`).forEach(e => e.remove());
  clone.querySelectorAll('br').forEach(e => e.replaceWith('\n'));
  clone.querySelectorAll('p,div,li,h1,h2,h3,h4,blockquote').forEach(e => e.append('\n'));
  return (clone.textContent || '').replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').replace(/\n\s*\n\s*\n/g, '\n\n').trim();
}

export function collectTargets(doc: Document, comments = false): Element[] {
  const selectors = [
    '.workshopItemTitle', '.workshopItemDescription', '.workshopItemPreviewDescription',
    '.workshopItemShortDescription', '.workshopItemCollectionTitle', '.workshopItemCollectionDescription',
    '.eventListingTitle', '.eventListingSummary',
  ];
  if (comments) selectors.push('.commentthread_comment_text');
  const candidates = new Set<Element>(doc.querySelectorAll(selectors.join(',')));
  // Steam's newer React workshop uses hashed classes; item URLs provide a stable seam.
  doc.querySelectorAll<HTMLAnchorElement>('a[href*="/sharedfiles/filedetails/"]').forEach(a => {
    if (a.closest(OWN) || a.querySelector('img,button') || !originalText(a)) return;
    const u = new URL(a.href, doc.URL);
    if (u.hostname !== 'steamcommunity.com' || !/^\/sharedfiles\/filedetails\/$/.test(u.pathname)) return;
    if (u.searchParams.has('id') && a.textContent!.trim().length < 350) candidates.add(a);
  });
  // Avoid translating both an anchor and its title container.
  return [...candidates].filter(e => {
    if (e.closest(OWN)) return false;
    for (let parent = e.parentElement; parent; parent = parent.parentElement)
      if (candidates.has(parent)) return false;
    return true;
  });
}

const CSS = `
#swt-panel{position:fixed;right:20px;bottom:24px;z-index:2147483600;width:292px;padding:14px;background:#1b2838;color:#c7d5e0;border:1px solid #426378;border-radius:8px;box-shadow:0 6px 24px #0009;font:13px/1.5 'Microsoft YaHei',sans-serif;box-sizing:border-box}
#swt-panel *{box-sizing:border-box} #swt-panel strong{font-size:15px;color:#fff}
#swt-panel button{font:inherit;border:0;border-radius:3px;padding:6px 10px;cursor:pointer;background:#32495f;color:#dce8f2;margin:8px 5px 4px 0}
#swt-panel .swt-primary{background:#156b96;color:white} #swt-panel button:disabled{opacity:.5;cursor:default}
#swt-panel label{display:inline-flex;align-items:center;gap:4px;margin-right:14px;cursor:pointer}
#swt-panel input{margin:0;accent-color:#67c1f5} #swt-panel small{display:block;color:#93a9bb;font-size:11px;margin-top:7px}
#swt-panel [role=status]{margin-top:8px;overflow-wrap:anywhere} #swt-panel .swt-fold{float:right;margin:0;padding:1px 7px}
#swt-panel{max-height:85vh;overflow:auto} #swt-panel select{display:block;width:100%;padding:5px;margin:7px 0;background:#243b50;color:#fff;border:1px solid #426378;border-radius:3px;font:inherit}
#swt-panel summary{cursor:pointer;color:#9fd9f4;margin-top:8px} #swt-panel .swt-source{display:block;margin:7px 0 0} #swt-panel [role=status]{white-space:pre-line}
.swt-translation{display:block!important;white-space:pre-wrap;color:#9fd9f4!important;font-size:13px!important;font-weight:normal!important;line-height:1.6!important;overflow-wrap:anywhere;max-height:none!important;margin-top:5px;padding:4px 6px;border-left:2px solid #4994b9;background:#14222d80}
.swt-translation:before{content:attr(data-swt-label);color:#76abc7;font-size:11px} .swt-error{color:#f2bb80!important}
[data-swt-host]{height:auto!important;max-height:none!important;overflow:visible!important;white-space:normal!important}
`;

export function mountTranslator(doc: Document, translate: Translate, clearCache: () => Promise<unknown>, translateBatch?: TranslateBatch, tools?: Tools) {
  if (doc.querySelector('#swt-panel')) return () => {};
  const win = doc.defaultView!;
  let prefs = { auto: false, comments: false, provider: 'auto' };
  try { prefs = { ...prefs, ...JSON.parse(win.localStorage.getItem(PREFS) || '{}') }; } catch {}
  if (!Object.prototype.hasOwnProperty.call(SOURCES, prefs.provider)) prefs.provider = 'auto';
  const save = () => { try { win.localStorage.setItem(PREFS, JSON.stringify(prefs)); } catch {} };
  const style = doc.createElement('style'); style.dataset.swtOwned = ''; style.textContent = CSS;
  doc.head.append(style);
  const panel = doc.createElement('aside'); panel.id = 'swt-panel'; panel.dataset.swtOwned = '';
  panel.setAttribute('aria-label', '海京翻译工具');
  const title = doc.createElement('strong'); title.textContent = '海京翻译工具 · 0.3.1'; panel.append(title);
  const fold = doc.createElement('button'); fold.textContent = '−'; fold.className = 'swt-fold'; fold.title = '收起 / 展开'; panel.append(fold);
  const content = doc.createElement('div'); panel.append(content);
  fold.onclick = () => { content.hidden = !content.hidden; fold.textContent = content.hidden ? '＋' : '−'; };
  const button = (text: string, handler: () => void, primary = false) => {
    const b = doc.createElement('button'); b.textContent = text; if (primary) b.className = 'swt-primary';
    b.onclick = handler; content.append(b); return b;
  };
  let epoch = 0, busy = false, disposed = false, rerun = false;
  const records = new Map<Element, { source: string; node: HTMLElement; provider: string }>();
  const removeTranslation = (el: Element, node: HTMLElement) => { node.remove(); el.removeAttribute('data-swt-host'); };
  const sessionCache = new Map<string, string>();
  const sessionOrigins = new Map<string, { providers: string[]; dictionary: boolean }>();
  const go = button('翻译本页', () => { void run(); }, true);
  const restore = button('还原', () => {
    epoch++; prefs.auto = false; auto.checked = false; save();
    records.forEach((r, el) => removeTranslation(el, r.node)); records.clear(); status.textContent = '已还原；自动翻译已关闭。';
  });
  restore.title = '移除译文，停止当前翻译，并关闭自动翻译';
  button('清缓存', () => {
    epoch++; prefs.auto = false; auto.checked = false; save();
    sessionCache.clear(); sessionOrigins.clear(); records.forEach((r, el) => removeTranslation(el, r.node)); records.clear();
    status.textContent = '正在清除缓存…';
    void clearCache().then(() => { status.textContent = '缓存已清空；自动翻译已关闭。'; })
      .catch(() => { status.textContent = '缓存清除失败，请稍后重试。'; });
  });
  const options = doc.createElement('div'); content.append(options);
  const checkbox = (text: string, checked: boolean, onChange: (value: boolean) => void) => {
    const label = doc.createElement('label'), input = doc.createElement('input');
    input.type = 'checkbox'; input.checked = checked; input.onchange = () => onChange(input.checked);
    label.append(input, doc.createTextNode(text)); options.append(label); return input;
  };
  const auto = checkbox('自动', !!prefs.auto, value => {
    prefs.auto = value; save(); if (value) void run(); else { epoch++; status.textContent = '自动翻译已关闭。'; }
  });
  checkbox('包括评论', !!prefs.comments, value => {
    prefs.comments = value; save();
    if (!value) for (const [el, r] of records) {
      if (el.matches('.commentthread_comment_text')) { removeTranslation(el, r.node); records.delete(el); }
    }
    epoch++; if (prefs.auto) void run();
  });
  const sourceLabel = doc.createElement('label'); sourceLabel.className = 'swt-source'; sourceLabel.textContent = '翻译源';
  const source = doc.createElement('select'); source.setAttribute('aria-label', '翻译源');
  for (const id of Object.keys(SOURCES)) {
    const option = doc.createElement('option'); option.value = id;
    option.textContent = id === 'offline' ? '本地模型（首选推荐 · 英→中）' : id === 'auto' ? '自动切换（推荐 · 本地优先）'
      : id === 'mymemory' ? 'MyMemory（备用 · 英中限额）' : id === 'dictionary' ? '本地词库（应急 · 词条匹配）' : 'Google（备用 · 多语种）';
    source.append(option);
  }
  source.value = prefs.provider; sourceLabel.append(source); content.append(sourceLabel);
  const status = doc.createElement('div'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  status.textContent = '保留原文，在下方显示简体中文。'; content.append(status);
  const note = doc.createElement('small'); content.append(note);
  const updateNote = () => {
    note.textContent = prefs.provider === 'auto' ? '推荐先用本地模型。自动模式先尝试本地模型，失败后依次尝试 Google、MyMemory、词库；在线阶段会发送所选文字。MyMemory 匿名额度约 5000 字符/天。'
      : prefs.provider === 'google' ? '所选文字发送给 Google。接口可能限流；图片文字暂不支持。'
      : prefs.provider === 'mymemory' ? '所选文字发送给 MyMemory；仅英语 → 简中。匿名额度约 5000 字符/天。'
      : prefs.provider === 'offline' ? '仅使用本机模型和该来源缓存，不发送给在线翻译服务。需要先下载并启动离线模型。'
      : '仅在本机匹配完整词条，不调用在线服务；未命中的整句不会被冒充为译文。';
  };
  updateNote();
  source.onchange = () => {
    epoch++; prefs.provider = source.value; save(); sessionCache.clear(); sessionOrigins.clear();
    records.forEach((r, el) => removeTranslation(el, r.node)); records.clear(); updateNote();
    status.classList.remove('swt-error'); status.textContent = `已切换到${SOURCES[prefs.provider]}，点击「翻译本页」应用。`;
    if (prefs.auto) { if (busy) rerun = true; else void run(); }
  };
  const help = doc.createElement('details'), summary = doc.createElement('summary'); summary.textContent = '离线模型 / 导入词库'; help.append(summary);
  const instructions = doc.createElement('small');
  instructions.textContent = '整句离线翻译：打开安装包，运行「安装离线翻译.cmd」下载模型及运行环境；以后运行「启动离线翻译.cmd」。准备好后选择「本地模型」。无需自己安装 Python。';
  help.append(instructions);
  const dictionaryHelp = doc.createElement('small'); dictionaryHelp.textContent = '词库示例：{"Field Tents":"野外帐篷"}。导入会替换自定义词库；内置词条保留。最大 2 MB / 10000 条。'; help.append(dictionaryHelp);
  if (tools) {
    const upload = doc.createElement('input'); upload.type = 'file'; upload.accept = '.json,application/json'; upload.hidden = true;
    const importButton = doc.createElement('button'); importButton.textContent = '导入本地词库'; importButton.onclick = () => upload.click();
    upload.onchange = async () => {
      const file = upload.files?.[0]; if (!file) return;
      try {
        if (file.size > 2000000) throw new Error('词库不能超过 2 MB。');
        const response = responseObject(await tools.importDictionary(await file.text()));
        if (response.ok !== true) throw new Error(typeof response.error === 'string' ? response.error : '词库导入失败。');
        epoch++; sessionCache.clear(); sessionOrigins.clear(); records.forEach((r, el) => removeTranslation(el, r.node)); records.clear();
        status.classList.remove('swt-error'); status.textContent = `已导入 ${response.count} 个自定义词条，点击「翻译本页」应用。`;
      } catch (e) { status.classList.add('swt-error'); status.textContent = userError(e); }
      upload.value = '';
    };
    help.append(importButton, upload);
  }
  content.append(help);
  doc.body.append(panel);

  async function run() {
    if (disposed) return;
    if (busy) { rerun = true; return; }
    busy = true; const generation = epoch; let done = 0; let failed = false;
    go.disabled = true; go.textContent = '翻译中…';
    try {
      for (const [el, r] of records) if (!el.isConnected) { removeTranslation(el, r.node); records.delete(el); }
      const targets = collectTargets(doc, prefs.comments).map(el => ({ el, source: originalText(el) })).filter(({ el, source }) => {
        const previous = records.get(el);
        if (previous && (previous.source !== source || !previous.node.isConnected)) { removeTranslation(el, previous.node); records.delete(el); }
        return !records.has(el) && /[a-zA-Z\u3040-\u30ff\uac00-\ud7af\u0400-\u04ff]{2}/.test(source) &&
          !el.closest('[hidden],[aria-hidden="true"]');
      });
      // Nearby visible content is rendered first; the rest follows in DOM order.
      const distance = (el: Element) => {
        const rect = el.getBoundingClientRect();
        return rect.bottom < 0 ? -rect.bottom : rect.top > win.innerHeight ? rect.top - win.innerHeight : 0;
      };
      const distances = new Map(targets.map(t => [t.el, distance(t.el)]));
      targets.sort((a, b) => distances.get(a.el)! - distances.get(b.el)!);
      const batch = targets.slice(0, 160);
      const prepared = batch.map(t => ({ ...t, parts: splitText(t.source, prefs.provider === 'mymemory' ? 140 : 550), rendered: false }));
      const partResults = new Map<string, string>();
      const partSources = new Map<string, { provider: string; kind: string }>();
      const pending = new Set<string>();
      for (const t of prepared) if (!sessionCache.has(t.source)) for (const p of t.parts) pending.add(p);
      const renderReady = () => {
        for (const t of prepared) {
          if (t.rendered || generation !== epoch || disposed) continue;
          const translated = sessionCache.get(t.source) ?? (t.parts.every(p => partResults.has(p))
            ? t.parts.map(p => partResults.get(p)).join('') : undefined);
          if (translated === undefined) continue;
          t.rendered = true;
          const { el, source } = t;
          if (!el.isConnected || originalText(el) !== source) continue;
          sessionCache.set(source, translated);
        const node = doc.createElement('span'); node.dataset.swtOwned = ''; node.className = 'swt-translation'; node.lang = 'zh-CN';
        const previousOrigin = sessionOrigins.get(source);
        const providers = previousOrigin?.providers ?? [...new Set(t.parts.map(p => partSources.get(p)?.provider || prefs.provider))];
        const origin = providers.map(id => SOURCES[id] || id).join(' / ');
        const dictionary = previousOrigin?.dictionary ?? t.parts.every(p => partSources.get(p)?.kind === 'dictionary');
        sessionOrigins.set(source, { providers, dictionary });
        node.dataset.swtLabel = `${dictionary ? '词库匹配' : '译文'} · ${origin}：`;
        node.dataset.swtProvider = providers.join(','); node.textContent = translated; // Never render service output as HTML.
        el.setAttribute('data-swt-host', ''); el.append(node); records.set(el, { source, node, provider: origin }); done++;
        }
      };
      renderReady();
      const jobs = [...pending];
      for (let index = 0; index < jobs.length;) {
        if (disposed || generation !== epoch) break;
        const group: string[] = []; let encoded = 0;
        const groupLimit = !translateBatch || prefs.provider === 'mymemory' ? 1 : prefs.provider === 'offline' ? 2 : 8;
        while (index < jobs.length && group.length < groupLimit) {
          const cost = encodeURIComponent(jobs[index]).length + 90;
          if (group.length && encoded + cost > 6500) break;
          group.push(jobs[index++]); encoded += cost;
        }
        status.classList.remove('swt-error'); status.textContent = `正在翻译 ${done} / ${batch.length}（每批最多 8 段）…`;
        if (translateBatch) {
          const response = responseObject(await translateBatch(group, prefs.provider));
          if (response.ok !== true) translationText(response);
          if (!Array.isArray(response.items) || response.items.length !== group.length)
            throw new Error('批量翻译返回数量异常，请重试。');
          let firstError: unknown;
          for (let i = 0; i < group.length; i++) {
            try {
              const item = responseObject(response.items[i]);
              partResults.set(group[i], translationText(item));
              partSources.set(group[i], { provider: typeof item.provider === 'string' ? item.provider : prefs.provider,
                kind: typeof item.kind === 'string' ? item.kind : 'translation' });
            } catch (e) { firstError ??= e; }
          }
          if (disposed || generation !== epoch) break;
          renderReady();
          if (firstError) throw firstError;
        } else partResults.set(group[0], translationText(await translate(group[0])));
        if (disposed || generation !== epoch) break;
        renderReady();
        // Let Steam handle paint and input between cached batches as well.
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      if (generation === epoch && !disposed) {
        const origins = [...new Set([...records.values()].map(r => r.provider))].join('、');
        status.textContent = (targets.length > batch.length ? `本轮完成 ${done} 处，点击继续翻译其余内容。` : `已完成，本页显示 ${records.size} 处结果。`) + (origins ? `来源：${origins}。` : '');
      }
    } catch (error) {
      failed = true;
      if (generation === epoch && !disposed) {
        status.classList.add('swt-error'); status.textContent = userError(error);
      }
    } finally {
      busy = false; go.disabled = false; go.textContent = failed ? '重试翻译' : '翻译本页';
      if (rerun && prefs.auto && !failed && !disposed) { rerun = false; void run(); } else rerun = false;
    }
  }

  let timer: ReturnType<typeof setTimeout>;
  const observer = new win.MutationObserver(changes => {
    if (!prefs.auto || disposed || changes.every(c => (c.target as Element).closest?.(OWN))) return;
    // Ignore our own inserted spans; react to text and newly loaded Steam content.
    if (changes.every(c => c.type === 'childList' && [...c.addedNodes, ...c.removedNodes].every(n =>
      n.nodeType === 1 && (n as Element).matches(OWN)))) return;
    clearTimeout(timer); timer = setTimeout(() => { if (prefs.auto) void run(); }, 700);
  });
  observer.observe(doc.body, { subtree: true, childList: true, characterData: true });
  if (prefs.auto) void run();
  return () => {
    disposed = true; epoch++; clearTimeout(timer); observer.disconnect();
    records.forEach((r, el) => removeTranslation(el, r.node)); records.clear(); panel.remove(); style.remove();
  };
}
