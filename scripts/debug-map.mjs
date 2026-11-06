import { chromium } from 'playwright-core';
import fs from 'node:fs';

const base = 'http://127.0.0.1:5178';
const executablePath = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => fs.existsSync(p));
const browser = await chromium.launch({ headless: true, executablePath, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));

await page.goto(`${base}/#/learn/c01-hello`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
const flow = page.locator('.cvz-flow').first();
await flow.scrollIntoViewIfNeeded();
await page.waitForTimeout(300);
await flow.screenshot({ path: 'shots/debug-flow.png' });
const trace = page.locator('.cvz-trace').first();
await trace.scrollIntoViewIfNeeded();
await page.waitForTimeout(300);
await trace.screenshot({ path: 'shots/debug-trace.png' });
console.log('flow box', await flow.boundingBox());
console.log('trace box', await trace.boundingBox());

await page.goto(`${base}/#/map`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1000);
const info = await page.evaluate(() => {
  const svg = document.querySelector('.map-canvas__svg');
  const nodes = [...document.querySelectorAll('.map-node')];
  const sample = nodes.slice(0, 6).map((n) => ({
    cls: n.getAttribute('class'),
    transform: n.getAttribute('transform'),
    rect: n.getBoundingClientRect().toJSON(),
    text: n.textContent,
    bg: n.querySelector('.map-node__bg')?.getAttribute('x'),
    label: n.querySelector('.map-node__label')?.getAttribute('x'),
  }));
  return {
    svgAttrs: svg
      ? {
          width: svg.getAttribute('width'),
          height: svg.getAttribute('height'),
          viewBox: svg.getAttribute('viewBox'),
          rect: svg.getBoundingClientRect().toJSON(),
          style: svg.getAttribute('style'),
        }
      : null,
    nodeCount: nodes.length,
    sample,
    gs: [...document.querySelectorAll('.map-nodes > g')].length,
    htmlHead: document.querySelector('.map-canvas')?.innerHTML.slice(0, 1200),
  };
});
console.log(JSON.stringify(info, null, 2));
await page.locator('.map-canvas').screenshot({ path: 'shots/debug-map.png' });
await browser.close();
