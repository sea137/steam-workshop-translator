// Millennium may decode a backend JSON string before passing it to WebKit.
export type Translate = (text: string) => Promise<unknown>;
export type TranslateBatch = (texts: string[], provider?: string) => Promise<unknown>;
type Tools = { importDictionary: (payload: string) => Promise<unknown> };
const SOURCES: Record<string, string> = { offline: '本地模型', auto: '自动切换', google: 'Google', mymemory: 'MyMemory', dictionary: '本地词库' };
const OWN = '[data-swt-owned]';
const PREFS = 'swt.preferences.v1';
// Classic Steam controls have stable names; current React carousel arrows are
// small icon buttons with hashed classes, so inspect those semantically below.
const PAGING = '.pagebtn,.workshop_paging_controls,.workshopBrowsePagingControls,.slider_button,[class*="paging"],[class*="Paging"],[class*="pagination"],a[rel="next"],a[rel="prev"],[aria-label*="下一"],[aria-label*="上一"],[aria-label*="Next"],[aria-label*="Previous"]';
const PANEL_MARGIN = 24;

export type Box = { left: number; top: number; right: number; bottom: number };

const laidOut = (b: Box) => b.right - b.left > 0 && b.bottom - b.top > 0;
const overlaps = (a: Box, b: Box) =>
  a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

/** How far the panel must move up to stop covering a paging control, capped so it stays usable. */
export function panelLift(panel: Box, blockers: Box[], viewportHeight: number): number {
  let lift = 0;
  for (const b of blockers) {
    if (!laidOut(b) || !overlaps(panel, b)) continue; // hidden, unlaid-out, or out of the way
    lift = Math.max(lift, panel.bottom - b.top + 12);
  }
  return lift <= 0 ? 0 : Math.min(lift, Math.max(0, Math.round(viewportHeight * 0.55)));
}

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
       /^\/sharedfiles\/filedetails\/?$/.test(u.pathname) ||
       /^\/sharedfiles\/filedetails\/changelog\/\d+\/?$/.test(u.pathname));
  } catch { return false; }
}

export function isSupportedSteamURL(url: string): boolean {
  if (isWorkshopURL(url)) return true;
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return false;
    if (u.hostname === 'store.steampowered.com') return /^\/news\/app\/\d+(?:\/|$)/.test(u.pathname);
    return u.hostname === 'steamcommunity.com' && (
      /^\/app\/\d+\/(?:news|allnews|announcements|events)(?:\/|$)/.test(u.pathname) ||
      /^\/(?:games|ogg|gid|groups)\/[^/]+\/(?:announcements|events)(?:\/|$)/.test(u.pathname));
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
  // News cards contain both desktop and mobile summaries. Drop hidden copies.
  const live = [...element.querySelectorAll('*')], copies = [...clone.querySelectorAll('*')];
  live.forEach((node, i) => {
    const style = element.ownerDocument.defaultView?.getComputedStyle(node);
    if (node.hasAttribute('hidden') || node.getAttribute('aria-hidden') === 'true' || style?.display === 'none' || style?.visibility === 'hidden')
      copies[i].remove();
  });
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
    '.EventDetailsBody', '.eventdetails_body', '.announcement_body', '.announcement_title',
    '.workshopAnnouncement', '.changeLogBody', '.changeLogTitle', '.changeLogRow',
  ];
  if (!isWorkshopURL(doc.URL) && isSupportedSteamURL(doc.URL))
    selectors.push('.apphub_CardContentTitle', '.apphub_CardTextContent', '.apphub_CardContentNews');
  if (comments) selectors.push('.commentthread_comment_text');
  const candidates = new Set<Element>(doc.querySelectorAll(selectors.join(',')));
  // Steam's newer React workshop uses hashed classes; item URLs provide a stable seam.
  doc.querySelectorAll<HTMLAnchorElement>('a[href*="/sharedfiles/filedetails/"]').forEach(a => {
    if (a.closest(OWN) || a.querySelector('img,button') || !originalText(a)) return;
    const u = new URL(a.href, doc.URL);
    if (u.hostname !== 'steamcommunity.com' || !/^\/sharedfiles\/filedetails\/$/.test(u.pathname)) return;
    if (u.searchParams.has('id') && a.textContent!.trim().length < 350) candidates.add(a);
  });
  // Semantic card hook observed in the current Steam workshop; inner class
  // names are hashed. The live visibility filter excludes duplicate summaries.
  doc.querySelectorAll('.OtherEvents_EventCtn').forEach(e => candidates.add(e));
  doc.querySelectorAll<HTMLAnchorElement>('a[href*="/announcements/detail/"],a[href*="/news/app/"]').forEach(a => {
    if (a.closest(OWN) || !originalText(a)) return;
    try {
      const link = new URL(a.href, doc.URL);
      if (isSupportedSteamURL(link.href) && a.textContent!.trim().length < 15000) candidates.add(a);
    } catch { /* malformed link */ }
  });
  if (doc.querySelector('.EventDetailsBody,.announcement_body')) {
    // Headlines are plain divs in the live client. Match actual page metadata,
    // avoiding a dependency on the current build's hashed title class.
    const titles = new Set<string>();
    for (const raw of [doc.querySelector<HTMLMetaElement>('meta[property="og:title"]')?.content, doc.title]) {
      const title = raw?.split(' :: ').pop()?.replace(/ - Steam News$/, '').trim();
      if (title) {
        titles.add(title);
        const separator = title.indexOf(' - ');
        if (separator >= 0) titles.add(title.slice(separator + 3));
      }
    }
    if (titles.size) doc.querySelectorAll('h1,h2,h3,[role="heading"],div').forEach(e => {
      if (!e.closest(OWN) && !e.childElementCount && titles.has(e.textContent?.trim() || '')) candidates.add(e);
    });
  }
  // Avoid translating both an anchor and its title container.
  return [...candidates].filter(e => {
    if (e.closest(OWN)) return false;
    for (let current: Element | null = e; current; current = current.parentElement) {
      const style = doc.defaultView?.getComputedStyle(current);
      if (current.hasAttribute('hidden') || current.getAttribute('aria-hidden') === 'true' || style?.display === 'none' || style?.visibility === 'hidden') return false;
    }
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
#swt-panel strong{cursor:move;user-select:none;-webkit-user-select:none} #swt-panel.swt-folded{width:auto;padding:7px 10px}
#swt-panel.swt-folded strong{font-size:13px} #swt-panel .swt-reset{background:#243b50;color:#cfe3f0;margin:6px 0 0}
#swt-panel summary{cursor:pointer;color:#9fd9f4;margin-top:8px} #swt-panel .swt-source{display:block;margin:7px 0 0} #swt-panel [role=status]{white-space:pre-line}
.swt-translation{display:block!important;white-space:pre-wrap;color:#9fd9f4!important;font-size:13px!important;font-weight:normal!important;line-height:1.6!important;overflow-wrap:anywhere;max-height:none!important;margin-top:5px;padding:4px 6px;border-left:2px solid #4994b9;background:#14222d80}
.swt-translation:before{content:attr(data-swt-label);color:#76abc7;font-size:11px} .swt-error{color:#f2bb80!important}
[data-swt-host]{height:auto!important;max-height:none!important;overflow:visible!important;white-space:normal!important}
`;

export function mountTranslator(doc: Document, translate: Translate, clearCache: () => Promise<unknown>, translateBatch?: TranslateBatch, tools?: Tools) {
  if (doc.querySelector('#swt-panel')) return () => {};
  const win = doc.defaultView!;
  let prefs: { auto: boolean; comments: boolean; provider: string; folded?: boolean; panel?: { x: number; y: number } } =
    { auto: false, comments: false, provider: 'auto' };
  try { prefs = { ...prefs, ...JSON.parse(win.localStorage.getItem(PREFS) || '{}') }; } catch {}
  if (!Object.prototype.hasOwnProperty.call(SOURCES, prefs.provider)) prefs.provider = 'auto';
  const save = () => { try { win.localStorage.setItem(PREFS, JSON.stringify(prefs)); } catch {} };
  const style = doc.createElement('style'); style.dataset.swtOwned = ''; style.textContent = CSS;
  doc.head.append(style);
  const panel = doc.createElement('aside'); panel.id = 'swt-panel'; panel.dataset.swtOwned = '';
  panel.setAttribute('aria-label', '海京翻译工具');
  const title = doc.createElement('strong'); title.textContent = '海京翻译工具 · 0.3.3'; title.title = '按住可拖动面板'; panel.append(title);
  const fold = doc.createElement('button'); fold.textContent = '−'; fold.className = 'swt-fold'; fold.title = '收起 / 展开'; panel.append(fold);
  const content = doc.createElement('div'); content.className = 'swt-body'; panel.append(content);

  // The panel is anchored bottom-right, where Steam puts its paging links; unless the player has
  // dragged it somewhere themselves, lift it clear of those controls after every layout change.
  let dragged = false;
  let drag: { dx: number; dy: number; moved: boolean } | null = null;
  const clamp = (value: number, max: number) => Math.min(Math.max(8, value), Math.max(8, max));
  const placeAt = (left: number, top: number) => {
    panel.style.left = `${clamp(left, (win.innerWidth || 0) - (panel.offsetWidth || 292) - 8)}px`;
    panel.style.top = `${clamp(top, (win.innerHeight || 0) - (panel.offsetHeight || 240) - 8)}px`;
    panel.style.right = 'auto'; panel.style.bottom = 'auto';
    dragged = true;
  };
  const place = () => {
    if (!panel.isConnected) return;
    if (dragged) {
      placeAt(parseFloat(panel.style.left) || 8, parseFloat(panel.style.top) || 8);
      return;
    }
    panel.style.left = ''; panel.style.top = ''; panel.style.right = ''; panel.style.bottom = '';
    const rect = panel.getBoundingClientRect() as Box;
    const controls = new Set<Element>(doc.querySelectorAll(PAGING));
    doc.querySelectorAll('button,a[role="button"]').forEach(el => {
      const b = el.getBoundingClientRect();
      if (!el.closest(OWN) && el.querySelector('svg') && !(el.textContent || '').trim() && b.width <= 120 && b.height <= 120)
        controls.add(el);
    });
    const blockers = [...controls].filter(el => !el.closest(OWN)).map(el => el.getBoundingClientRect() as Box);
    // If Steam renames those classes, hit-test the panel's lower edge instead: whatever clickable
    // control sits under it there is what the player cannot reach.
    if (!blockers.some(b => laidOut(b) && overlaps(rect, b))) {
      const under = coveredControl(rect);
      if (under) blockers.push(under);
    }
    const lift = panelLift(rect, blockers, win.innerHeight || 0);
    if (lift > 0) {
      const top = rect.top - lift;
      if (top >= 8) panel.style.bottom = `${PANEL_MARGIN + lift}px`;
      else {
        // Lifting a tall panel can put its header outside the window. Try the
        // other corner instead, keeping both the panel and controls reachable.
        const width = panel.offsetWidth, height = panel.offsetHeight;
        const candidates = [
          { x: 8, y: Math.max(8, win.innerHeight - height - PANEL_MARGIN) },
          { x: Math.max(8, win.innerWidth - width - 20), y: 8 },
          { x: 8, y: 8 },
        ];
        const candidate = candidates.find(p => blockers.every(b => !laidOut(b) || !overlaps(
          { left: p.x, right: p.x + width, top: p.y, bottom: p.y + height }, b)));
        if (candidate) {
          panel.style.left = `${candidate.x}px`; panel.style.top = `${candidate.y}px`;
          panel.style.right = 'auto'; panel.style.bottom = 'auto';
        }
      }
    }
  };
  const coveredControl = (rect: Box): Box | null => {
    if (typeof doc.elementFromPoint !== 'function') return null;
    const previous = panel.style.pointerEvents;
    panel.style.pointerEvents = 'none';
    try {
      for (const y of [rect.bottom - 14, rect.bottom - 42]) {
        for (const x of [rect.right - 14, (rect.left + rect.right) / 2]) {
          const el = doc.elementFromPoint(x, y);
          const target = el && !el.closest(OWN) ? el.closest('a,button,[role=button]') : null;
          if (target) return target.getBoundingClientRect() as Box;
        }
      }
    } catch { /* elementFromPoint unavailable */ } finally { panel.style.pointerEvents = previous; }
    return null;
  };
  if (prefs.panel && (!Number.isFinite(prefs.panel.x) || !Number.isFinite(prefs.panel.y))) delete prefs.panel;
  title.addEventListener('mousedown', event => {
    if (event.button !== 0) return;
    const rect = panel.getBoundingClientRect();
    drag = { dx: event.clientX - rect.left, dy: event.clientY - rect.top, moved: false };
    event.preventDefault();
  });
  const onMove = (event: MouseEvent) => {
    if (!drag) return;
    if (!drag.moved && Math.abs(event.clientX - drag.dx - panel.getBoundingClientRect().left) < 4 &&
      Math.abs(event.clientY - drag.dy - panel.getBoundingClientRect().top) < 4) return;
    drag.moved = true;
    placeAt(event.clientX - drag.dx, event.clientY - drag.dy);
  };
  const onUp = () => {
    if (!drag) return;
    // A click on the title must not pin the panel; only a real drag saves a position.
    if (drag.moved) { prefs.panel = { x: parseFloat(panel.style.left) || 0, y: parseFloat(panel.style.top) || 0 }; save(); }
    else dragged = false;
    drag = null;
  };
  win.addEventListener('mousemove', onMove);
  win.addEventListener('mouseup', onUp);
  const setFolded = (folded: boolean) => {
    content.hidden = folded;
    fold.textContent = folded ? '＋' : '−';
    panel.classList.toggle('swt-folded', folded);
    prefs.folded = folded; save();
    place();
  };
  fold.onclick = () => setFolded(!content.hidden);
  setFolded(!!prefs.folded);
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
  const resetPosition = doc.createElement('button'); resetPosition.className = 'swt-reset'; resetPosition.textContent = '面板位置复位';
  resetPosition.title = '回到右下角，并自动避开翻页按钮';
  resetPosition.onclick = () => {
    delete prefs.panel; save(); dragged = false; drag = null; place();
    status.classList.remove('swt-error'); status.textContent = '面板已复位到右下角；如仍挡住翻页按钮可拖动标题栏移开。';
  };
  help.append(resetPosition);
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
  if (prefs.panel) placeAt(prefs.panel.x, prefs.panel.y);
  place();
  // Steam renders the paging controls after the items; re-check after layout settles and whenever
  // the page scrolls or the window resizes.
  let reflow: ReturnType<typeof setTimeout>;
  const onReflow = () => { clearTimeout(reflow); reflow = setTimeout(place, 150); };
  win.addEventListener('resize', onReflow);
  win.addEventListener('scroll', onReflow, true);
  const panelResize = typeof win.ResizeObserver === 'function' ? new win.ResizeObserver(onReflow) : undefined;
  panelResize?.observe(panel);
  help.addEventListener('toggle', onReflow);

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
    disposed = true; epoch++; clearTimeout(timer); clearTimeout(reflow); observer.disconnect(); panelResize?.disconnect();
    win.removeEventListener('resize', onReflow); win.removeEventListener('scroll', onReflow, true);
    win.removeEventListener('mousemove', onMove); win.removeEventListener('mouseup', onUp);
    records.forEach((r, el) => removeTranslation(el, r.node)); records.clear(); panel.remove(); style.remove();
  };
}
