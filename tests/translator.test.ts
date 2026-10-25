import { test, expect } from 'bun:test';
import { Window } from 'happy-dom';
import { readFileSync } from 'node:fs';
import { collectTargets, isWorkshopURL, mountTranslator, originalText, splitText } from '../webview/translator';

const page = (html = '<div class="workshopItemTitle">Field Tents</div>') => {
  const w = new Window({ url: 'https://steamcommunity.com/app/294100/workshop/' });
  w.document.body.innerHTML = html;
  return w;
};
const tick = () => new Promise(resolve => setTimeout(resolve, 20));
const waitFor = async (ready: () => boolean, timeout = 3000) => {
  const deadline = Date.now() + timeout;
  while (!ready() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
  expect(ready()).toBe(true);
};
const click = (w: Window, label: string) => {
  const b = [...w.document.querySelectorAll('button')].find(b => b.textContent === label)!;
  expect(b).toBeDefined(); b.click();
};
const good = async (s: string) => JSON.stringify({ ok: true, text: `中文 ${s}` });

test('native RPC timeout is explained in Chinese without exposing framework English', async () => {
  const w = page();
  const stop = mountTranslator(w.document as any, async () => { throw new Error('Millennium Error: RPC timeout for child: local.workshop.translator'); }, async () => true);
  click(w, '翻译本页'); await tick();
  const text = w.document.querySelector('[role=status]')!.textContent!;
  expect(text).toContain('超时'); expect(text).not.toContain('Millennium Error'); expect(text).not.toContain('local.workshop.translator');
  stop();
});

test('source recommendations put the local model first and explain every option', () => {
  const w = page(); const stop = mountTranslator(w.document as any, good, async () => true);
  const options = [...w.document.querySelectorAll('select option')];
  expect(options[0].getAttribute('value')).toBe('offline');
  expect(options[0].textContent).toContain('首选推荐');
  expect(options.every(o => /首选推荐|推荐|备用|应急/.test(o.textContent!))).toBe(true);
  stop();
});

test('provider selection cancels old work, clears prior results and persists source', async () => {
  const w = page(); const providers: string[] = [];
  const stop = mountTranslator(w.document as any, good, async () => true,
    async (texts, provider) => { providers.push(provider!); return { ok: true, items: texts.map(() => ({ ok: true, text: '备用结果', provider: provider === 'auto' ? 'mymemory' : provider })) }; });
  click(w, '翻译本页'); await tick();
  expect(providers).toEqual(['auto']);
  expect(w.document.querySelector('.swt-translation')!.getAttribute('data-swt-label')).toContain('MyMemory');
  click(w, '还原'); click(w, '翻译本页'); await tick();
  expect(w.document.querySelector('.swt-translation')!.getAttribute('data-swt-label')).toContain('MyMemory');
  const select = w.document.querySelector('select')!;
  select.value = 'offline'; select.dispatchEvent(new w.Event('change'));
  expect(w.document.querySelector('.swt-translation')).toBeNull();
  click(w, '翻译本页'); await tick();
  expect(providers).toEqual(['auto', 'offline']);
  expect(JSON.parse(w.localStorage.getItem('swt.preferences.v1')!).provider).toBe('offline');
  expect(w.document.querySelector('.swt-translation')!.getAttribute('data-swt-label')).toContain('本地模型'); stop();
});

test('batch partial failures preserve successful results and label glossary matches honestly', async () => {
  const w = page('<div class="workshopItemTitle">Field Tents</div><div class="workshopItemTitle">Unknown words here</div>');
  const stop = mountTranslator(w.document as any, good, async () => true, async () => ({ ok: true, items: [
    { ok: true, text: '野外帐篷', provider: 'dictionary', kind: 'dictionary' }, { ok: false, error: '本地词库未命中' },
  ] }));
  click(w, '翻译本页'); await tick();
  expect(w.document.querySelectorAll('.swt-translation')).toHaveLength(1);
  expect(w.document.querySelector('.swt-translation')!.getAttribute('data-swt-label')).toContain('词库匹配');
  expect(w.document.querySelector('[role=status]')!.textContent).toBe('本地词库未命中'); stop();
});

test('switching source during an in-flight response cannot render the previous source result', async () => {
  const w = page(); let resolve!: (x: unknown) => void;
  const stop = mountTranslator(w.document as any, good, async () => true, () => new Promise(r => resolve = r));
  click(w, '翻译本页');
  const select = w.document.querySelector('select')!; select.value = 'dictionary'; select.dispatchEvent(new w.Event('change'));
  resolve({ ok: true, items: [{ ok: true, text: '旧结果', provider: 'google' }] }); await tick();
  expect(w.document.querySelector('.swt-translation')).toBeNull(); stop();
});

test('24 workshop titles use three batch RPCs and render all translations', async () => {
  const w = page(Array.from({ length: 24 }, (_, i) => `<div class="workshopItemTitle">Workshop title ${i}</div>`).join(''));
  let singleCalls = 0, batchCalls = 0;
  const stop = mountTranslator(w.document as any,
    async s => { singleCalls++; return good(s); }, async () => true,
    async (texts: string[]) => { batchCalls++; return { ok: true, items: texts.map(text => ({ ok: true, text: `中文 ${text}` })) }; });
  click(w, '翻译本页'); await waitFor(() => w.document.querySelectorAll('.swt-translation').length === 24);
  expect(singleCalls).toBe(0); expect(batchCalls).toBe(3);
  expect(w.document.querySelectorAll('.swt-translation')).toHaveLength(24); stop();
});

test('Steam bridge decoded objects render successfully without parsing object as JSON', async () => {
  const w = page();
  const stop = mountTranslator(w.document as any,
    async () => ({ ok: true, text: '野外帐篷', cached: true }), async () => true);
  click(w, '翻译本页'); await tick();
  const message = w.document.querySelector('[role=status]')!.textContent;
  expect(w.document.querySelector('.swt-translation')?.textContent).toBe('野外帐篷');
  expect(message).toContain('已完成');
  stop();
});

test('Steam bridge object errors preserve the service error and allow retry', async () => {
  const w = page(); let fail = true;
  const stop = mountTranslator(w.document as any, async () => fail
    ? { ok: false, error: '翻译服务连接失败（429）' }
    : { ok: true, text: '野外帐篷' }, async () => true);
  click(w, '翻译本页'); await tick();
  expect(w.document.querySelector('[role=status]')!.textContent).toBe('翻译服务连接失败（429）');
  fail = false; click(w, '重试翻译'); await tick();
  expect(w.document.querySelector('.swt-translation')!.textContent).toBe('野外帐篷'); stop();
});

test('invalid bridge payloads show readable errors without altering original text', async () => {
  for (const payload of [null, [], 42, 'not JSON', { ok: true, text: 123 }, { ok: true, text: '' }]) {
    const w = page(); const stop = mountTranslator(w.document as any, async () => payload, async () => true);
    click(w, '翻译本页'); await tick();
    expect(w.document.querySelector('.swt-translation')).toBeNull();
    expect(w.document.querySelector('[role=status]')!.textContent).toMatch(/翻译服务/);
    expect(w.document.querySelector('.workshopItemTitle')!.textContent).toBe('Field Tents'); stop();
  }
});

test('runs only on HTTPS Steam workshop routes', () => {
  for (const path of ['/app/294100/workshop/', '/workshop/browse/?appid=294100', '/sharedfiles/filedetails/?id=1'])
    expect(isWorkshopURL(`https://steamcommunity.com${path}`)).toBe(true);
  for (const u of ['https://steamcommunity.com/chat/', 'https://steamcommunity.com.evil.test/workshop/',
    'http://steamcommunity.com/workshop/', 'https://store.steampowered.com/', 'not a URL'])
    expect(isWorkshopURL(u)).toBe(false);
});

test('splits long multilingual descriptions without lost text or broken emoji', () => {
  const source = ('Animals.\n野营 ⛺🐈 abc '.repeat(230));
  const parts = splitText(source);
  expect(parts.join('')).toBe(source);
  expect(parts.every(p => Array.from(p).length <= 1100)).toBe(true);
  expect(parts.every(p => !/[\uD800-\uDBFF]$/.test(p))).toBe(true);
});

test('selects legacy titles and descriptions, preserves links, excludes authors and comments', () => {
  const w = page('<div class="workshopItemTitle"><a href="/sharedfiles/filedetails/?id=1">Field Tents</a></div>' +
    '<div class="workshopItemDescription">First<br>Second <b>bold</b><pre>code()</pre></div>' +
    '<div class="friendBlockContent">Author Name</div><div class="commentthread_comment_text">Hello there</div>');
  expect(collectTargets(w.document as any)).toHaveLength(2);
  expect(collectTargets(w.document as any, true)).toHaveLength(3);
  expect(originalText(w.document.querySelector('.workshopItemDescription') as any)).toBe('First\nSecond bold');
});

test('new React workshop title URLs work without relying on hashed classes', () => {
  const w = page('<a class="abc-xyz" href="/sharedfiles/filedetails/?id=42">Field Tents</a>' +
    '<a href="/sharedfiles/filedetails/?id=42"><img alt="Field Tents"></a><a href="/id/author">Author</a>');
  expect(collectTargets(w.document as any)).toHaveLength(1);
});

test('captured real workshop homepage contains recognizable item titles', () => {
  const html = readFileSync(new URL('./fixtures/workshop-home.html', import.meta.url), 'utf8');
  const w = page(html);
  const targets = collectTargets(w.document as any);
  expect(targets.length).toBeGreaterThan(10);
  expect(targets.some(e => originalText(e).includes('Field Tents'))).toBe(true);
});

test('keeps original markup, treats translated HTML as text, and restores cleanly', async () => {
  const w = page('<div class="workshopItemTitle"><a href="/sharedfiles/filedetails/?id=1">Field Tents</a></div>');
  const original = w.document.body.innerHTML;
  const stop = mountTranslator(w.document as any, async () => JSON.stringify({ ok: true, text: '<img src=x onerror=alert(1)>野外帐篷' }), async () => true);
  click(w, '翻译本页'); await tick();
  expect(w.document.querySelector('.swt-translation')!.textContent).toContain('野外帐篷');
  expect(w.document.querySelector('.swt-translation img')).toBeNull();
  expect(w.document.querySelector('a')!.getAttribute('href')).toBe('/sharedfiles/filedetails/?id=1');
  click(w, '还原');
  expect(w.document.querySelector('.swt-translation')).toBeNull();
  stop(); expect(w.document.body.innerHTML).toBe(original);
});

test('restore cancels an in-flight response', async () => {
  const w = page(); let resolve!: (s: string) => void;
  const stop = mountTranslator(w.document as any, () => new Promise(r => resolve = r), async () => true);
  click(w, '翻译本页'); click(w, '还原'); resolve(await good('Field Tents')); await tick();
  expect(w.document.querySelector('.swt-translation')).toBeNull(); stop();
});

test('errors preserve originals and allow retry', async () => {
  const w = page(); let fail = true;
  const stop = mountTranslator(w.document as any, async s => {
    if (fail) return JSON.stringify({ ok: false, error: '网络不通' });
    return good(s);
  }, async () => true);
  click(w, '翻译本页'); await tick();
  expect(w.document.querySelector('[role=status]')!.textContent).toBe('网络不通');
  expect(w.document.querySelector('.workshopItemTitle')!.textContent).toBe('Field Tents');
  fail = false; click(w, '重试翻译'); await tick();
  expect(w.document.querySelectorAll('.swt-translation')).toHaveLength(1); stop();
});

test('repeated scans do not retranslate or duplicate inserted translations', async () => {
  const w = page(); let calls = 0;
  const stop = mountTranslator(w.document as any, async s => { calls++; return good(s); }, async () => true);
  click(w, '翻译本页'); await tick(); click(w, '翻译本页'); await tick();
  expect(calls).toBe(1); expect(w.document.querySelectorAll('.swt-translation')).toHaveLength(1);
  // Simulate React replacing title text while retaining the same root.
  w.document.querySelector('.workshopItemTitle')!.textContent = "Worker's Assistant";
  click(w, '翻译本页'); await tick();
  expect(calls).toBe(2); expect(w.document.querySelector('.swt-translation')!.textContent).toContain("Worker's Assistant"); stop();
});

test('automatic mode picks up newly loaded items and comments stay opt-in', async () => {
  const w = page(); const stop = mountTranslator(w.document as any, good, async () => true);
  const inputs = w.document.querySelectorAll<HTMLInputElement>('input');
  inputs[0].click(); await tick();
  const next = w.document.createElement('div'); next.className = 'workshopItemTitle'; next.textContent = 'Animal Cuddling';
  w.document.body.append(next);
  await waitFor(() => next.querySelector('.swt-translation') !== null);
  expect(next.querySelector('.swt-translation')).not.toBeNull();
  expect(inputs[1].checked).toBe(false); stop();
});
