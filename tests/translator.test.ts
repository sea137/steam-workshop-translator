import { test, expect } from 'bun:test';
import { Window } from 'happy-dom';
import { readFileSync } from 'node:fs';
import { watchSteamDocument } from '../webview/lifecycle';
import { collectTargets, isWorkshopURL, isSupportedSteamURL, isSupportedSteamDocument, mountTranslator, originalText, panelLift, splitText } from '../webview/translator';

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

test('failed paragraph can retry alone while later batches and successful parts survive', async () => {
  const w = page(Array.from({ length: 4 }, (_, i) => `<div class="workshopItemTitle">Paragraph number ${i}</div>`).join(''));
  w.localStorage.setItem('swt.preferences.v1', JSON.stringify({ provider: 'offline' }));
  const calls: string[][] = []; let fail = true;
  const stop = mountTranslator(w.document as any, good, async () => true, async texts => {
    calls.push(texts);
    return { ok: true, items: texts.map(s => fail && s.endsWith('0') ? { ok: false, error: '这一段暂时失败' }
      : { ok: true, text: `译文 ${s}`, provider: 'offline' }) };
  });
  click(w, '翻译本页'); await tick(); await tick();
  expect(w.document.querySelectorAll('.swt-translation').length).toBe(3);
  expect(w.document.querySelectorAll('.swt-failure').length).toBe(1);
  fail = false; click(w, '重试此段'); await tick();
  expect(calls.at(-1)).toEqual(['Paragraph number 0']);
  expect(w.document.querySelectorAll('.swt-translation').length).toBe(4);
  expect(w.document.querySelector('.swt-failure')).toBeNull(); stop();
});

test('two Steam documents serialize requests; restoring a queued page removes its request', async () => {
  const a = page(' <div class="workshopItemTitle">First article</div>');
  const b = page(' <div class="workshopItemTitle">Second article</div>');
  let release!: (v: unknown) => void; let calls = 0;
  const bridge = async (texts: string[]) => {
    calls++;
    if (calls === 1) return await new Promise(resolve => release = resolve);
    return { ok: true, items: texts.map(() => ({ ok: true, text: '第二页译文' })) };
  };
  const stopA = mountTranslator(a.document as any, good, async () => true, bridge);
  const stopB = mountTranslator(b.document as any, good, async () => true, bridge);
  click(a, '翻译本页'); await tick(); click(b, '翻译本页'); await tick();
  expect(calls).toBe(1); click(b, '还原');
  release({ ok: true, items: [{ ok: true, text: '第一页译文' }] }); await tick();
  expect(calls).toBe(1); expect(b.document.querySelector('.swt-translation')).toBeNull(); stopA(); stopB();
});

test('retrying a split paragraph reuses successful chunks instead of retranslating them', async () => {
  const w = page(`<div class="workshopItemDescription">${'First sentence of this long description. '.repeat(35)}</div>`);
  w.localStorage.setItem('swt.preferences.v1', JSON.stringify({ provider: 'offline' }));
  const calls: string[][] = []; let broken = true;
  const text = originalText(w.document.querySelector('.workshopItemDescription') as any);
  const chunks = splitText(text, 550), failedChunk = chunks.at(-1)!;
  const stop = mountTranslator(w.document as any, good, async () => true, async texts => {
    calls.push(texts); return { ok: true, items: texts.map(s => broken && s === failedChunk ? { ok: false, error: '分片失败' }
      : { ok: true, text: '中文分片', provider: 'offline' }) };
  });
  click(w, '翻译本页'); await waitFor(() => !!w.document.querySelector('.swt-failure'));
  await waitFor(() => !w.document.querySelector<HTMLButtonElement>('#swt-panel .swt-primary')!.disabled);
  const previous = calls.length; broken = false; click(w, '重试此段');
  await waitFor(() => !!w.document.querySelector('.swt-translation'));
  expect(calls.slice(previous)).toEqual([[failedChunk]]); stop();
});

test('pending batches follow the new viewport after scrolling', async () => {
  const w = page(Array.from({ length: 8 }, (_, i) => `<div class="workshopItemTitle">Article number ${i}</div>`).join(''));
  w.localStorage.setItem('swt.preferences.v1', JSON.stringify({ provider: 'offline' }));
  let moved = false;
  w.document.querySelectorAll('.workshopItemTitle').forEach((el, i) => {
    el.getBoundingClientRect = () => { const y = (moved ? i >= 6 : i < 2) ? 20 : 10000 + i * 100;
      return { x: 0, y, top: y, bottom: y + 20, width: 200, height: 20, left: 0, right: 200, toJSON() {} }; };
  });
  let release!: (v: unknown) => void; const calls: string[][] = [];
  const result = (texts: string[]) => ({ ok: true, items: texts.map(() => ({ ok: true, text: '中文段落', provider: 'offline' })) });
  const stop = mountTranslator(w.document as any, good, async () => true, async texts => {
    calls.push(texts); if (calls.length === 1) return await new Promise(r => release = r); return result(texts);
  });
  click(w, '翻译本页'); await waitFor(() => calls.length === 1);
  moved = true; release(result(calls[0])); await waitFor(() => calls.length === 4);
  expect(calls[0]).toEqual(['Article number 0', 'Article number 1']);
  expect(calls[1]).toEqual(['Article number 6', 'Article number 7']); stop();
});

test('offline translation starts an installed service and waits for readiness', async () => {
  const w = page(); w.localStorage.setItem('swt.preferences.v1', JSON.stringify({ provider: 'offline' }));
  let checks = 0, ready = false;
  const stop = mountTranslator(w.document as any, good, async () => true, async texts => {
    expect(ready).toBe(true);
    return { ok: true, items: texts.map(() => ({ ok: true, text: '野外帐篷', provider: 'offline' })) };
  }, { importDictionary: async () => true, prepareOffline: async () => {
    if (++checks < 2) return { ok: true, state: 'starting' };
    ready = true; return { ok: true, state: 'ready' };
  } } as any);
  click(w, '翻译本页'); await waitFor(() => !!w.document.querySelector('.swt-translation'));
  expect(checks).toBe(2); stop();
});

test('missing offline installation gives guidance and never translates online in strict local mode', async () => {
  const w = page(); w.localStorage.setItem('swt.preferences.v1', JSON.stringify({ provider: 'offline' }));
  let translated = false;
  const stop = mountTranslator(w.document as any, good, async () => true, async () => {
    translated = true; return { ok: true, items: [{ ok: true, text: 'unexpected' }] };
  }, { importDictionary: async () => true, prepareOffline: async () => ({ ok: true, state: 'missing' }) } as any);
  click(w, '翻译本页'); await tick();
  expect(translated).toBe(false); expect(w.document.querySelector('[role=status]')!.textContent).toContain('安装离线翻译'); stop();
});

test('restoring while offline service starts cancels translation without late results', async () => {
  const w = page(); w.localStorage.setItem('swt.preferences.v1', JSON.stringify({ provider: 'offline' }));
  let release!: (value: unknown) => void; let translated = false;
  const stop = mountTranslator(w.document as any, good, async () => true, async () => { translated = true; return {}; },
    { importDictionary: async () => true, prepareOffline: () => new Promise(resolve => release = resolve) });
  click(w, '翻译本页'); click(w, '还原'); release({ ok: true, state: 'ready' }); await tick();
  expect(translated).toBe(false); expect(w.document.querySelector('.swt-translation')).toBeNull(); stop();
});

test('choosing Google does not start a local model', async () => {
  const w = page(); w.localStorage.setItem('swt.preferences.v1', JSON.stringify({ provider: 'google' }));
  let checked = false;
  const stop = mountTranslator(w.document as any, good, async () => true,
    async () => ({ ok: true, items: [{ ok: true, text: '在线结果', provider: 'google' }] }),
    { importDictionary: async () => true, prepareOffline: async () => { checked = true; return {}; } });
  click(w, '翻译本页'); await tick(); expect(checked).toBe(false);
  expect(w.document.querySelector('.swt-translation')!.textContent).toBe('在线结果'); stop();
});

test('library update popup is eligible even though the client URL stays unchanged', () => {
  const w = new Window({ url: 'https://steamloopback.host/index.html' });
  expect(isSupportedSteamDocument(w.document as any)).toBe(false);
  w.document.body.innerHTML = '<div class="EventDetailsBody">Example game update.</div>';
  expect(isSupportedSteamDocument(w.document as any)).toBe(true);
});

test('library update paragraphs translate directly below each original and restore exact markup', async () => {
  const w = new Window({ url: 'https://steamloopback.host/index.html' });
  w.document.body.innerHTML = '<div class="PartnerEvent InLibraryView"><div class="LibraryEventTitleContainer"><div>News</div><div>Example update title</div></div>' +
    '<div class="EventDetailsBody">First <b>important</b> paragraph.<br><br>Second <a href="https://example.com/">linked</a> paragraph.<br><h3>Compatibility</h3><p>Third paragraph.</p><ul><li>First item.</li><li>Second item.<ul><li>Nested item.</li></ul></li></ul></div></div>';
  const original = w.document.body.innerHTML;
  const link = w.document.querySelector('a');
  const stop = mountTranslator(w.document as any, good, async () => true,
    async texts => ({ ok: true, items: texts.map(text => ({ ok: true, text: '中文 ' + text, provider: 'offline' })) }));
  click(w as any, '翻译本页');
  await waitFor(() => w.document.querySelector('[role=status]')!.textContent!.includes('已完成'));
  const body = w.document.querySelector('.EventDetailsBody')!;
  expect(body.querySelectorAll('.swt-translation')).toHaveLength(7);
  const segments = [...body.querySelectorAll('[data-swt-segment]')];
  expect(segments.map(e => originalText(e as any))).toEqual(['First important paragraph.', 'Second linked paragraph.', 'Compatibility', 'Third paragraph.', 'First item.', 'Second item.', 'Nested item.']);
  expect(body.querySelector('h3 > [data-swt-segment] > .swt-translation')).not.toBeNull();
  expect(body.querySelector('a')).toBe(link);
  click(w as any, '还原'); stop();
  expect(w.document.body.innerHTML).toBe(original);
  expect(w.document.querySelector('a')).toBe(link);
});

test('library watcher opens, closes and reopens in-place without duplicate panels', async () => {
  const w = new Window({ url: 'https://steamloopback.host/index.html' });
  const stop = watchSteamDocument(w.document as any, { translate: good, clearCache: async () => true,
    translateBatch: async texts => ({ ok: true, items: texts.map(text => ({ ok: true, text: '中文 ' + text })) }),
    importDictionary: async () => ({ ok: true }) });
  expect(w.document.querySelector('#swt-panel')).toBeNull();
  const body = w.document.createElement('div'); body.className = 'EventDetailsBody'; body.textContent = 'First update.'; w.document.body.append(body);
  await waitFor(() => !!w.document.querySelector('#swt-panel'));
  click(w as any, '翻译本页'); await waitFor(() => !!body.querySelector('.swt-translation'));
  body.remove(); await waitFor(() => !w.document.querySelector('#swt-panel'));
  w.document.body.append(body); await waitFor(() => !!w.document.querySelector('#swt-panel'));
  expect(w.document.querySelectorAll('#swt-panel')).toHaveLength(1);
  stop(); expect(w.document.querySelector('#swt-panel')).toBeNull();
});

test('completed news paragraphs appear before later translation batches finish', async () => {
  const w = page('<div class="EventDetailsBody"><p>First paragraph.</p><p>Second paragraph.</p><p>Third paragraph.</p></div>');
  w.localStorage.setItem('swt.preferences.v1', JSON.stringify({ provider: 'offline' }));
  let release!: (value: unknown) => void; let calls = 0;
  const stop = mountTranslator(w.document as any, good, async () => true, async texts => {
    if (++calls === 2) return new Promise(resolve => release = resolve);
    return { ok: true, items: texts.map(text => ({ ok: true, text: '中文 ' + text })) };
  });
  click(w, '翻译本页'); await waitFor(() => calls === 2);
  expect(w.document.querySelectorAll('p > [data-swt-segment] > .swt-translation')).toHaveLength(2);
  expect(w.document.querySelector('p:last-child .swt-translation')).toBeNull();
  release({ ok: true, items: [{ ok: true, text: '中文 Third paragraph.' }] });
  await waitFor(() => w.document.querySelectorAll('.EventDetailsBody .swt-translation').length === 3); stop();
});

test('library translates the visible article instead of preloaded previous and next articles', () => {
  const w = new Window({ url: 'https://steamloopback.host/index.html' });
  w.document.body.innerHTML = '<div class="PartnerEvent"><div class="EventDetailsBody">Previous article.</div></div>' +
    '<div class="PartnerEvent"><div class="LibraryEventTitleContainer"><div>Current update title</div></div><div class="EventDetailsBody">Current article.</div></div>' +
    '<div class="PartnerEvent"><div class="EventDetailsBody">Next article.</div></div>';
  const events = w.document.querySelectorAll('.PartnerEvent');
  [events[0], events[1], events[2]].forEach((e, i) => {
    e.getBoundingClientRect = () => ({ top: (i - 1) * 2000, bottom: (i - 1) * 2000 + 900 } as any);
  });
  expect(collectTargets(w.document as any).map(originalText)).toEqual(['Current article.', 'Current update title']);
  events[1].setAttribute('hidden', '');
  expect(collectTargets(w.document as any).map(originalText)).not.toContain('Current article.');
});

test('a foreign page cannot opt into the library translator by copying Steam classes', () => {
  const w = new Window({ url: 'https://steamloopback.host.evil.test/index.html' });
  w.document.body.innerHTML = '<div class="EventDetailsBody">Example update.</div>';
  expect(isSupportedSteamDocument(w.document as any)).toBe(false);
});

test('news, announcements and change notes are supported without matching unrelated sites', () => {
  for (const url of ['https://steamcommunity.com/app/294100/news/',
    'https://steamcommunity.com/ogg/294100/announcements/detail/123',
    'https://steamcommunity.com/games/rimworld/announcements/',
    'https://store.steampowered.com/news/app/294100/view/123',
    'https://steamcommunity.com/sharedfiles/filedetails/changelog/123']) expect(isSupportedSteamURL(url)).toBe(true);
  for (const url of ['https://store.steampowered.com/app/294100/', 'https://steamcommunity.com/chat/',
    'https://steamcommunity.com.evil.test/ogg/294100/announcements/detail/123',
    'http://store.steampowered.com/news/app/294100/']) expect(isSupportedSteamURL(url)).toBe(false);
});

test('workshop news cards include their title and visible summary without duplicate hidden copies', () => {
  const w = page('<a class="OtherEvents_EventCtn" href="https://steamcommunity.com/ogg/294100/announcements/detail/1">' +
    '<div>Update 1.7</div><div>New performance improvements.</div><div hidden>New performance improvements.</div></a>');
  const targets = collectTargets(w.document as any);
  expect(targets).toHaveLength(1);
  expect(originalText(targets[0])).toContain('Update 1.7');
  expect(originalText(targets[0]).match(/New performance/g)).toHaveLength(1);
});

test('announcement detail selects its actual headline and body while preserving links', async () => {
  const w = page(); w.location.href = 'https://steamcommunity.com/ogg/294100/announcements/detail/1';
  w.document.title = 'Steam :: RimWorld :: New update';
  w.document.body.innerHTML = '<div class="hashed-title">New update</div><div class="EventDetailsBody">New weapons.<br>Read <a href="https://example.com/">the details</a>.</div><div class="author">Author Name</div>';
  const stop = mountTranslator(w.document as any, good, async () => true);
  click(w, '翻译本页'); await tick();
  expect(w.document.querySelectorAll('.swt-translation')).toHaveLength(3);
  expect(w.document.querySelector('.EventDetailsBody a')!.getAttribute('href')).toBe('https://example.com/');
  expect(w.document.querySelector('.author .swt-translation')).toBeNull();
  click(w, '还原'); expect(w.document.querySelectorAll('.swt-translation')).toHaveLength(0); stop();
});

test('Steam announcement structure fixture selects the complete BBCode body', () => {
  const html = readFileSync(new URL('./fixtures/announcement-detail.html', import.meta.url), 'utf8');
  const w = page(html); w.location.href = 'https://steamcommunity.com/ogg/294100/announcements/detail/672882362547178634';
  const targets = collectTargets(w.document as any);
  const body = targets.find(e => e.classList.contains('EventDetailsBody'));
  expect(body).toBeDefined();
  expect(originalText(body!)).toContain('Performance improvements');
  expect(originalText(body!)).toContain('Testing update 1.7');
  expect(originalText(body!).length).toBeGreaterThan(3000);
});

test('Steam store news headline metadata is matched without translating navigation', () => {
  const w = page('<div>RimWorld</div><div>New update</div><div class="EventDetailsBody">Full patch notes here.</div>');
  w.location.href = 'https://store.steampowered.com/news/app/294100/view/123';
  w.document.title = 'RimWorld - New update - Steam News';
  const targets = collectTargets(w.document as any);
  expect(targets.map(originalText)).toContain('New update');
  expect(targets.map(originalText)).not.toContain('RimWorld');
});

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
  expect(w.document.querySelector('.swt-failure')!.textContent).toContain('本地词库未命中');
  expect(w.document.querySelector('[role=status]')!.textContent).toContain('1 段未完成'); stop();
});

test('switching source during an in-flight response cannot render the previous source result', async () => {
  const w = page(); let resolve!: (x: unknown) => void;
  const stop = mountTranslator(w.document as any, good, async () => true, () => new Promise(r => resolve = r));
  click(w, '翻译本页');
  const select = w.document.querySelector('select')!; select.value = 'dictionary'; select.dispatchEvent(new w.Event('change'));
  resolve({ ok: true, items: [{ ok: true, text: '旧结果', provider: 'google' }] }); await tick();
  expect(w.document.querySelector('.swt-translation')).toBeNull(); stop();
});

test('automatic mode resumes the new source after cancelling the previous in-flight request', async () => {
  const w = page(); w.localStorage.setItem('swt.preferences.v1', JSON.stringify({ auto: true, provider: 'google' }));
  let release!: (v: unknown) => void; const providers: string[] = [];
  const stop = mountTranslator(w.document as any, good, async () => true, async (texts, provider) => {
    providers.push(provider!);
    if (providers.length === 1) return await new Promise(resolve => release = resolve);
    return { ok: true, items: texts.map(() => ({ ok: true, text: '新来源译文', provider })) };
  });
  await waitFor(() => providers.length === 1);
  const select = w.document.querySelector('select')!; select.value = 'dictionary'; select.dispatchEvent(new w.Event('change'));
  release({ ok: true, items: [{ ok: true, text: '旧来源译文', provider: 'google' }] });
  await tick(); await tick(); expect(providers).toEqual(['google', 'dictionary']);
  expect(w.document.querySelector('.swt-translation')!.textContent).toBe('新来源译文'); stop();
});

test('automatic source change also resumes when an offline readiness check was pending', async () => {
  const w = page(); w.localStorage.setItem('swt.preferences.v1', JSON.stringify({ auto: true, provider: 'offline' }));
  let release!: (v: unknown) => void; const providers: string[] = [];
  const stop = mountTranslator(w.document as any, good, async () => true, async (texts, provider) => {
    providers.push(provider!); return { ok: true, items: texts.map(() => ({ ok: true, text: '新来源译文', provider })) };
  }, { importDictionary: async () => true, prepareOffline: () => new Promise(resolve => release = resolve) });
  await waitFor(() => !!release);
  const select = w.document.querySelector('select')!; select.value = 'dictionary'; select.dispatchEvent(new w.Event('change'));
  release({ ok: true, state: 'ready' }); await tick(); await tick();
  expect(providers).toEqual(['dictionary']); stop();
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
    expect(originalText(w.document.querySelector('.workshopItemTitle') as any)).toBe('Field Tents'); stop();
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
  expect(originalText(w.document.querySelector('.workshopItemTitle') as any)).toBe('Field Tents');
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

// The panel is anchored in the corner where Steam draws its paging links (#issue: 会拦住翻页按钮).
test('the panel lifts only as far as needed to clear the paging controls', () => {
  const panel = { left: 900, right: 1192, top: 600, bottom: 900 };
  expect(panelLift(panel, [], 900)).toBe(0);
  // Overlapping the paging row by 60px lifts it 60px plus a small gap.
  expect(panelLift(panel, [{ left: 880, right: 1200, top: 840, bottom: 880 }], 900)).toBe(72);
  // Lifting never pushes more than half the window out of place.
  expect(panelLift(panel, [{ left: 0, right: 1200, top: 0, bottom: 900 }], 900)).toBe(495);
  // Controls elsewhere on the page, and hidden ones, move nothing.
  expect(panelLift(panel, [{ left: 10, right: 100, top: 10, bottom: 60 }], 900)).toBe(0);
  expect(panelLift(panel, [{ left: 0, right: 0, top: 0, bottom: 0 }], 900)).toBe(0);
});

test('the fold button shrinks the panel and the choice survives a page navigation', () => {
  const w = page();
  let stop = mountTranslator(w.document as any, good, async () => true);
  const panel = () => w.document.querySelector('#swt-panel') as HTMLElement;
  expect(panel().classList.contains('swt-folded')).toBe(false);
  click(w, '−');
  expect(panel().classList.contains('swt-folded')).toBe(true);
  expect((w.document.querySelector('.swt-body') as HTMLElement).hidden).toBe(true);
  expect(w.localStorage.getItem('swt.preferences.v1')).toContain('"folded":true');
  stop();
  stop = mountTranslator(w.document as any, good, async () => true);
  expect(panel().classList.contains('swt-folded')).toBe(true);
  expect((w.document.querySelector('.swt-body') as HTMLElement).hidden).toBe(true);
  stop();
});

test('the panel can be dragged off the corner and stays where the player put it', () => {
  const w = page();
  let stop = mountTranslator(w.document as any, good, async () => true);
  const panel = () => w.document.querySelector('#swt-panel') as HTMLElement;
  const handle = panel().querySelector('strong')!;
  handle.dispatchEvent(new w.MouseEvent('mousedown', { bubbles: true, button: 0, clientX: 100, clientY: 100 }));
  w.dispatchEvent(new w.MouseEvent('mousemove', { clientX: 200, clientY: 150 }));
  w.dispatchEvent(new w.MouseEvent('mouseup', {}));
  expect(panel().style.left).toBe('100px'); expect(panel().style.top).toBe('50px');
  expect(w.localStorage.getItem('swt.preferences.v1')).toContain('"panel":{"x":100,"y":50}');
  stop();
  stop = mountTranslator(w.document as any, good, async () => true);
  expect(panel().style.left).toBe('100px'); expect(panel().style.top).toBe('50px');
  // The reset button in the help section returns it to the corner.
  click(w, '面板位置复位');
  expect(panel().style.left).toBe(''); expect(panel().style.top).toBe('');
  expect(w.localStorage.getItem('swt.preferences.v1')).not.toContain('"panel"');
  stop();
});

test('a dragged panel is clamped back inside a smaller Steam window', async () => {
  const w = page();
  w.localStorage.setItem('swt.preferences.v1', JSON.stringify({ panel: { x: 950, y: 580 } }));
  const stop = mountTranslator(w.document as any, good, async () => true);
  const panel = w.document.querySelector('#swt-panel') as HTMLElement;
  Object.defineProperty(panel, 'offsetWidth', { value: 292 });
  Object.defineProperty(panel, 'offsetHeight', { value: 320 });
  w.innerWidth = 760; w.innerHeight = 520;
  w.dispatchEvent(new w.Event('resize'));
  await new Promise(resolve => setTimeout(resolve, 180));
  expect(parseFloat(panel.style.left) + 292).toBeLessThanOrEqual(760);
  expect(parseFloat(panel.style.top) + 320).toBeLessThanOrEqual(520);
  stop();
});

test('expanding help reclamps a saved panel after its height changes', async () => {
  const w = page(); w.innerWidth = 760; w.innerHeight = 520;
  w.localStorage.setItem('swt.preferences.v1', JSON.stringify({ panel: { x: 300, y: 250 } }));
  const stop = mountTranslator(w.document as any, good, async () => true);
  const panel = w.document.querySelector('#swt-panel') as HTMLElement;
  Object.defineProperty(panel, 'offsetHeight', { value: 400 });
  const help = panel.querySelector('details')!;
  help.dispatchEvent(new w.Event('toggle'));
  await new Promise(resolve => setTimeout(resolve, 180));
  expect(parseFloat(panel.style.top) + 400).toBeLessThanOrEqual(520);
  stop();
});

test('click jitter on a title does not pin the panel position', () => {
  const w = page(); const stop = mountTranslator(w.document as any, good, async () => true);
  const handle = w.document.querySelector('#swt-panel strong')!;
  handle.dispatchEvent(new w.MouseEvent('mousedown', { button: 0, clientX: 100, clientY: 100 }));
  w.dispatchEvent(new w.MouseEvent('mousemove', { clientX: 101, clientY: 101 }));
  w.dispatchEvent(new w.MouseEvent('mouseup'));
  expect(w.localStorage.getItem('swt.preferences.v1')).not.toContain('"panel"'); stop();
});
