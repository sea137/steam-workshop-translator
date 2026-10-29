// Run with Node + Playwright installed; pass a Bun-built browser-entry.ts bundle.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.route('https://steamcommunity.com/sharedfiles/filedetails/?id=1', r => r.fulfill({ contentType: 'text/html', body: '<html><body></body></html>' }));
    await page.goto('https://steamcommunity.com/sharedfiles/filedetails/?id=1');
    await page.addScriptTag({ path: process.argv[2] });
    const result = await page.evaluate(async () => {
      document.body.innerHTML = '<div id="scroll" style="height:320px;overflow-y:auto;overflow-anchor:none;margin-top:100px"><div class="EventDetailsBody">' +
        Array.from({ length: 20 }, (_, i) => `<p style="margin:0;height:60px">Original paragraph number ${i} for reading.</p>`).join('') + '</div></div>';
      const surface = document.querySelector('#scroll'); surface.scrollTop = 400;
      const candidates = [...document.querySelectorAll('p')], anchor = candidates[7];
      const before = anchor.getBoundingClientRect().top;
      const extra = document.createElement('div'); extra.style.height = '125px';
      candidates[0].after(extra);
      const unprotectedJump = anchor.getBoundingClientRect().top - before;
      extra.remove();
      window.keepReadingPosition(document, candidates, () => candidates[0].after(extra));
      const inserted = anchor.getBoundingClientRect().top;
      window.keepReadingPosition(document, candidates, () => extra.remove());
      const restored = anchor.getBoundingClientRect().top;
      candidates.forEach(el => { el.style.height = ''; el.style.minHeight = '60px'; });
      const stop = window.mountTranslator(document, async () => ({}), async () => true, async texts => ({ ok: true,
        items: texts.map(() => ({ ok: true, text: '这是一段用于验证阅读位置保持的中文译文。'.repeat(4), provider: 'offline' })) }));
      const original = anchor.getBoundingClientRect().top;
      [...document.querySelectorAll('#swt-panel button')].find(b => b.textContent === '翻译本页').click();
      const deadline = Date.now() + 6000;
      while (document.querySelectorAll('.swt-translation').length < 20 && Date.now() < deadline) await new Promise(r => setTimeout(r, 20));
      const translated = anchor.getBoundingClientRect().top;
      const count = document.querySelectorAll('.swt-translation').length;
      [...document.querySelectorAll('#swt-panel button')].find(b => b.textContent === '还原').click();
      const afterRestore = anchor.getBoundingClientRect().top;
      stop(); return { unprotectedJump, before, inserted, restored, original, translated, afterRestore, count };
    });
    assert.equal(result.count, 20);
    assert.ok(result.unprotectedJump >= 100, 'the fixture must reproduce an unprotected reading jump');
    for (const [a, b] of [['before', 'inserted'], ['before', 'restored'], ['original', 'translated'], ['original', 'afterRestore']])
      assert.ok(Math.abs(result[a] - result[b]) <= 1, `${a} -> ${b}: ${JSON.stringify(result)}`);
    console.log(JSON.stringify({ ok: true, ...result }));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
