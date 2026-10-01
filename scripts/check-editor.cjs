// Run against a disposable local server with a synthetic two-page PDF fixture.
// PLAYWRIGHT_MODULE may point to an existing Playwright installation.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');

(async () => {
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  try {
    await page.goto(process.env.BASE_URL || 'http://127.0.0.1:8876');
    const file = fs.readFileSync(process.argv[2] || 'test-results/editor-sample.pdf');
    const transfer = await page.evaluateHandle(bytes => {
      const dt = new DataTransfer();
      dt.items.add(new File([new Uint8Array(bytes)], 'editor-sample.pdf', { type: 'application/pdf' }));
      return dt;
    }, [...file]);
    await page.locator('.sheet').dispatchEvent('drop', { dataTransfer: transfer });
    await page.waitForURL('**/#/t/edit');
    await page.locator('.pg > img').first().waitFor();
    await page.waitForFunction(() => [...document.querySelectorAll('.pg > img')].every(i => i.complete && i.naturalWidth));
    assert.equal(await page.locator('.pg').count(), 2, 'dropped PDF opens immediately');
    const viewport = page.locator('.ed-viewport');
    const box = await viewport.boundingBox();
    const point = { x: box.x + box.width / 2, y: box.y + 180 };
    const geometry = () => page.locator('.pg').first().evaluate((el, point) => {
      const r = el.getBoundingClientRect();
      return { width: r.width, x: (point.x-r.left)/r.width, y: (point.y-r.top)/r.height };
    }, point);
    const before = await geometry();
    await page.mouse.move(point.x, point.y);
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, -120);
    await page.keyboard.up('Control');
    await page.waitForTimeout(200);
    const after = await geometry();
    assert(after.width > before.width, 'Ctrl+wheel zooms PDF');
    assert(Math.abs(after.y - before.y) < .02, 'zoom preserves pointer anchor');
    await page.keyboard.press('Control+=');
    await page.keyboard.press('Control+=');
    const scrollBefore = await viewport.evaluate(el => ({ x: el.scrollLeft, y: el.scrollTop }));
    await page.getByRole('button', { name: 'Dikdörtgen', exact: true }).click();
    await page.keyboard.down('Control');
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    await page.mouse.move(point.x - 80, point.y - 80, { steps: 8 });
    await page.mouse.up();
    await page.keyboard.up('Control');
    const scrollAfter = await viewport.evaluate(el => ({ x: el.scrollLeft, y: el.scrollTop }));
    assert(scrollAfter.x > scrollBefore.x && scrollAfter.y > scrollBefore.y, 'Ctrl+drag pans both axes');
    assert.equal(await page.locator('.obj').count(), 0, 'panning does not draw');
    for (const gesture of ['Space', 'hand', 'middle']) {
      if (gesture === 'hand') await page.getByRole('button', { name: 'Sayfada gezin', exact: true }).click();
      if (gesture === 'Space') await page.keyboard.down('Space');
      const previous = await viewport.evaluate(el => el.scrollTop);
      await page.mouse.move(point.x, point.y);
      await page.mouse.down({ button: gesture === 'middle' ? 'middle' : 'left' });
      await page.mouse.move(point.x, point.y - 40, { steps: 4 });
      await page.mouse.up({ button: gesture === 'middle' ? 'middle' : 'left' });
      if (gesture === 'Space') await page.keyboard.up('Space');
      assert((await viewport.evaluate(el => el.scrollTop)) > previous, `${gesture} pans`);
    }
    await page.keyboard.press('Control+0');
    assert(await viewport.evaluate(el => el.scrollWidth <= el.clientWidth + 1), 'fit removes horizontal overflow');
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'page does not overlap panel');
    await page.getByRole('button', { name: 'Kısayollar', exact: true }).click();
    assert(await page.getByText('PDF düzenleme kısayolları', { exact: true }).isVisible());
    await page.getByRole('button', { name: 'Kapat', exact: true }).last().click();
    await page.getByRole('button', { name: 'Metin ekle', exact: true }).click();
    await viewport.evaluate(el => { el.scrollTop = 0; });
    await page.locator('.pg .ov').first().click({ position: { x: 120, y: 120 } });
    await page.locator('[contenteditable="plaintext-only"]').waitFor();
    await page.keyboard.type('Test yazisi');
    assert.match(await page.locator('[contenteditable="plaintext-only"]').innerText(), /Test yazisi/);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Control+z');
    await page.keyboard.press('Control+y');
    assert(await page.locator('.obj').count() > 0, 'undo/redo restores edit');
    await page.getByRole('combobox', { name: 'Bu PDF ile başka işlem yap' }).selectOption('compress');
    assert(await page.getByText('Kaydedilmemiş değişiklikler', { exact: true }).isVisible());
    await page.getByRole('button', { name: 'Düzenlemeye devam et', exact: true }).click();
    assert(await page.locator('.obj').count() > 0, 'cancel tool switch keeps changes');
    await page.screenshot({ path: 'test-results/editor-desktop.png', fullPage: true });
    await page.setViewportSize({ width: 800, height: 700 });
    await page.waitForTimeout(250);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '800px window stays within screen');
    assert(await page.getByRole('button', { name: 'Mevcut metni düzelt', exact: true }).isVisible());
    await page.screenshot({ path: 'test-results/editor-small.png', fullPage: true });
    const resultResponse = page.waitForResponse(r => r.url().includes('/api/process/') && r.request().method() === 'POST');
    await page.keyboard.press('Control+s');
    await page.locator('.result').waitFor({ timeout: 30000 });
    const result = await (await resultResponse).json();
    const download = await page.request.get(`${new URL(page.url()).origin}/api/files/${result.result.id}/download`);
    assert(download.ok(), 'edited PDF downloads');
    fs.writeFileSync('test-results/editor-output.pdf', await download.body());
    await page.goto((process.env.BASE_URL || 'http://127.0.0.1:8876') + '/#/');
    const picker = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Dosya seç', exact: true }).click();
    await (await picker).setFiles([
      { name: 'first.pdf', mimeType: 'application/pdf', buffer: file },
      { name: 'second.pdf', mimeType: 'application/pdf', buffer: file },
    ]);
    await page.locator('.upload-previews img').first().waitFor();
    assert.equal(await page.locator('.upload-previews img').count(), 2, 'multiple upload shows both previews');
    assert.deepEqual(errors, [], 'no JavaScript exceptions');
    console.log('PASS: drop preview, image loading, zoom anchor, Ctrl/Space/hand/middle drag, no accidental draw, fit, help, typing, undo/redo, switch guard, small window, Ctrl+S export/download, multi-file previews.');
  } catch (e) { await page.screenshot({ path: 'test-results/editor-failure.png', fullPage: true }); throw e; }
  finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });

