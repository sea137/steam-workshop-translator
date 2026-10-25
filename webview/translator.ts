// Millennium may decode a backend JSON string before passing it to WebKit.
export type Translate = (text: string) => Promise<unknown>;
export type TranslateBatch = (texts: string[]) => Promise<unknown>;
const OWN = '[data-swt-owned]';
const PREFS = 'swt.preferences.v1';

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
.swt-translation{display:block!important;white-space:pre-wrap;color:#9fd9f4!important;font-size:13px!important;font-weight:normal!important;line-height:1.6!important;overflow-wrap:anywhere;max-height:none!important;margin-top:5px;padding:4px 6px;border-left:2px solid #4994b9;background:#14222d80}
.swt-translation:before{content:'译文 · ';color:#76abc7;font-size:11px} .swt-error{color:#f2bb80!important}
[data-swt-host]{height:auto!important;max-height:none!important;overflow:visible!important;white-space:normal!important}
`;

export function mountTranslator(doc: Document, translate: Translate, clearCache: () => Promise<unknown>, translateBatch?: TranslateBatch) {
  if (doc.querySelector('#swt-panel')) return () => {};
  const win = doc.defaultView!;
  let prefs = { auto: false, comments: false };
  try { prefs = { ...prefs, ...JSON.parse(win.localStorage.getItem(PREFS) || '{}') }; } catch {}
  const save = () => { try { win.localStorage.setItem(PREFS, JSON.stringify(prefs)); } catch {} };
  const style = doc.createElement('style'); style.dataset.swtOwned = ''; style.textContent = CSS;
  doc.head.append(style);
  const panel = doc.createElement('aside'); panel.id = 'swt-panel'; panel.dataset.swtOwned = '';
  panel.setAttribute('aria-label', '海京翻译工具');
  const title = doc.createElement('strong'); title.textContent = '海京翻译工具 · 0.2.0'; panel.append(title);
  const fold = doc.createElement('button'); fold.textContent = '−'; fold.className = 'swt-fold'; fold.title = '收起 / 展开'; panel.append(fold);
  const content = doc.createElement('div'); panel.append(content);
  fold.onclick = () => { content.hidden = !content.hidden; fold.textContent = content.hidden ? '＋' : '−'; };
  const button = (text: string, handler: () => void, primary = false) => {
    const b = doc.createElement('button'); b.textContent = text; if (primary) b.className = 'swt-primary';
    b.onclick = handler; content.append(b); return b;
  };
  let epoch = 0, busy = false, disposed = false, rerun = false;
  const records = new Map<Element, { source: string; node: HTMLElement }>();
  const removeTranslation = (el: Element, node: HTMLElement) => { node.remove(); el.removeAttribute('data-swt-host'); };
  const sessionCache = new Map<string, string>();
  const go = button('翻译本页', () => { void run(); }, true);
  const restore = button('还原', () => {
    epoch++; prefs.auto = false; auto.checked = false; save();
    records.forEach((r, el) => removeTranslation(el, r.node)); records.clear(); status.textContent = '已还原；自动翻译已关闭。';
  });
  restore.title = '移除译文，停止当前翻译，并关闭自动翻译';
  button('清缓存', () => {
    epoch++; prefs.auto = false; auto.checked = false; save();
    sessionCache.clear(); records.forEach((r, el) => removeTranslation(el, r.node)); records.clear();
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
  const status = doc.createElement('div'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  status.textContent = '保留原文，在下方显示简体中文。'; content.append(status);
  const note = doc.createElement('small'); note.textContent = '点击翻译会把所选工坊文字发送给 Google 翻译。图片中的文字暂不支持。'; content.append(note);
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
      const prepared = batch.map(t => ({ ...t, parts: splitText(t.source), rendered: false }));
      const partResults = new Map<string, string>();
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
        node.textContent = translated; // Never render service output as HTML.
        el.setAttribute('data-swt-host', ''); el.append(node); records.set(el, { source, node }); done++;
        }
      };
      renderReady();
      const jobs = [...pending];
      for (let index = 0; index < jobs.length;) {
        if (disposed || generation !== epoch) break;
        const group: string[] = []; let encoded = 0;
        while (index < jobs.length && group.length < (translateBatch ? 8 : 1)) {
          const cost = encodeURIComponent(jobs[index]).length + 90;
          if (group.length && encoded + cost > 6500) break;
          group.push(jobs[index++]); encoded += cost;
        }
        status.classList.remove('swt-error'); status.textContent = `正在翻译 ${done} / ${batch.length}（每批最多 8 段）…`;
        if (translateBatch) {
          const response = responseObject(await translateBatch(group));
          if (response.ok !== true) translationText(response);
          if (!Array.isArray(response.items) || response.items.length !== group.length)
            throw new Error('批量翻译返回数量异常，请重试。');
          for (let i = 0; i < group.length; i++) partResults.set(group[i], translationText(response.items[i]));
        } else partResults.set(group[0], translationText(await translate(group[0])));
        if (disposed || generation !== epoch) break;
        renderReady();
        // Let Steam handle paint and input between cached batches as well.
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      if (generation === epoch && !disposed) status.textContent = targets.length > batch.length
        ? `本轮完成 ${done} 处，点击继续翻译其余内容。` : `已完成，本页显示 ${records.size} 处译文。`;
    } catch (error) {
      failed = true;
      if (generation === epoch && !disposed) {
        status.classList.add('swt-error'); status.textContent = error instanceof Error ? error.message : '翻译失败，请重试。';
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
