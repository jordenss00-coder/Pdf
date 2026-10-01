// Güncelleme şeridi, sürüm notları, indirme ilerlemesi, ayarlar ve tema düğmesi için Edge testi.
// Masaüstü modundaki test sunucusuna ve scripts/fake-update-feed.py kaynağına karşı çalışır;
// kurulum başlatılmaz (tarayıcıda pywebview köprüsü yoktur). Adımlar docs/WIP-0.4.0.md içinde.
// Ortam: BASE_URL, DESKTOP_TOKEN, FEED_VERSION, PLAYWRIGHT_MODULE.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8877';
const TOKEN = process.env.DESKTOP_TOKEN || 'uitest-desktop-token-0123456789';
const VERSION = process.env.FEED_VERSION || '9.9.9';
const out = 'test-results';

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1366, height: 860 }, colorScheme: 'light' })).newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const closeDialog = () => page.locator('dialog[open] .dlg-foot').getByRole('button', { name: 'Kapat' }).click();
  try {
    await page.goto(`${BASE}/desktop/${TOKEN}`);
    await page.waitForSelector('a.tile');
    const bar = page.locator('#update-bar');
    await bar.getByText(`PDF Atölye ${VERSION} yayınlandı`).waitFor({ timeout: 20000 });
    assert.equal(await page.locator('#settings-btn.has-badge').count(), 1, 'settings badge');
    await page.screenshot({ path: `${out}/update-banner.png` });

    await bar.getByRole('button', { name: 'Neler yeni?' }).click();
    await page.waitForSelector('dialog[open] .release-notes');
    const notes = await page.locator('.release-notes').innerText();
    assert(!notes.includes('**') && !notes.includes('](') && notes.includes('Güncelleme denetimi'), 'notes cleaned');
    await closeDialog();

    // Tema: açık sistemde koyuyu sabitler, yenilemede kalır, ikinci tıklamada sisteme döner.
    await page.locator('#theme-btn').click();
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');
    assert.equal(await page.evaluate(() => document.querySelector('meta[name=color-scheme]').content), 'dark');
    await page.reload();
    await page.waitForSelector('a.tile');
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark', 'theme persists');
    assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(15, 20, 30)');

    await bar.getByRole('button', { name: 'İndir ve kur' }).click();
    await bar.getByText('indiriliyor').waitFor();
    await page.waitForTimeout(3000);
    assert.match(await bar.locator('.update-pct').innerText(), /%\d+/, 'progress shown');
    await page.screenshot({ path: `${out}/update-progress-dark.png` });
    await page.locator('#settings-btn').click();
    await page.waitForSelector('dialog[open] .set-sec');
    await closeDialog();

    await bar.getByText('kurulmaya hazır').waitFor({ timeout: 120000 });
    await bar.getByRole('button', { name: 'Şimdi kur' }).click();
    await page.getByText('yalnızca PDF Atölye masaüstü penceresinden').waitFor();

    await page.locator('#theme-btn').click();
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), undefined, 'back to system');
    await page.locator('#settings-btn').click();
    await page.waitForSelector('dialog[open] .set-sec');
    const auto = page.getByLabel('Uygulama açılırken güncellemeleri denetle');
    assert(await auto.isChecked());
    await auto.uncheck();
    await page.waitForTimeout(300);
    assert.equal((await (await page.request.get(`${BASE}/api/update`)).json()).auto, false, 'auto-check saved');
    await auto.check();
    assert.deepEqual(errors, [], 'no JavaScript exceptions');
    console.log('PASS: update banner, notes, theme pin/reload/reset, download progress, ready state, settings auto-check.');
  } catch (e) { await page.screenshot({ path: `${out}/update-failure.png`, fullPage: true }); throw e; }
  finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
