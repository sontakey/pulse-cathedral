const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const path = require('node:path');

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('file://' + path.resolve('benchmarks/artifacts/mpu-toolbox/report.html'));
  assert.equal(await page.locator('#recording option').count(), 5);
  assert.equal(await page.locator('canvas').count(), 6);
  for (const recording of ['10', '5', '8', '9', 'root-hd']) {
    await page.selectOption('#recording', recording);
    for (const segment of ['early', 'middle', 'late']) {
      await page.selectOption('#segment', segment);
      assert.match(await page.locator('#clip-info').innerText(), /face candidate/);
      assert.equal(await page.locator('#clip-metrics tr').count(), 5);
      const before = await page.locator('#trace-4').evaluate(c => c.toDataURL());
      await page.locator('#position').evaluate(el => {
        el.value = +el.min + 40;
        el.dispatchEvent(new Event('input', { bubbles: true }));
      });
      const after = await page.locator('#trace-4').evaluate(c => c.toDataURL());
      assert.notEqual(before, after, `${recording}/${segment}: waveform did not move`);
    }
  }
  await page.selectOption('#span', '60');
  await page.screenshot({ path: 'benchmarks/artifacts/mpu-toolbox/report-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.selectOption('#recording', '10');
  await page.selectOption('#segment', 'early');
  await page.selectOption('#span', '10');
  await page.screenshot({ path: 'benchmarks/artifacts/mpu-toolbox/report-mobile.png', fullPage: true });
  assert.deepEqual(errors, []);
  await browser.close();
  console.log('PASS: all 15 clips, moving waveforms, 60-second view, desktop/mobile, no browser errors.');
})().catch(e => { console.error(e); process.exit(1); });
