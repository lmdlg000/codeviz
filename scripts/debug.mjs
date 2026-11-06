import { chromium } from 'playwright-core';
import fs from 'node:fs';

const base = 'http://127.0.0.1:5178';
const executablePath = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => fs.existsSync(p));

const browser = await chromium.launch({ headless: true, executablePath, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.on('console', (m) => console.log('CONSOLE', m.type(), m.text()));
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));

await page.goto(`${base}/#/learn/c01-hello`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);

const engineInfo = await page.evaluate(async () => {
  const mod = await import('/src/engine/index.ts');
  const code = `#include <stdio.h>
int add(int a, int b) { return a + b; }
int main(void) {
  int a[3] = {1, 2, 3};
  int sum = 0;
  for (int i = 0; i < 3; i++) { sum += a[i]; }
  printf("%d", add(sum, 4));
  return 0;
}`;
  const r = mod.analyzeCode(code);
  const t = mod.simulate(code);
  return {
    ok: r.ok,
    functions: r.functions.map((f) => f.name),
    flowcharts: r.flowcharts.map((f) => ({ id: f.functionId, name: f.functionName, count: f.nodeCount })),
    flowEntry: r.flowcharts[0]?.entry,
    classes: r.classes.length,
    stats: r.stats,
    trace: { ok: t.ok, steps: t.steps.length, output: t.output, error: t.error },
  };
});
console.log('ENGINE', JSON.stringify(engineInfo, null, 2).slice(0, 5000));

const diagramInfo = await page.evaluate(() => {
  const diagrams = [...document.querySelectorAll('.cvz-diagram')];
  return diagrams.map((d) => ({
    html: d.innerHTML.slice(0, 500),
    text: d.textContent?.slice(0, 200),
    rect: d.getBoundingClientRect().toJSON(),
  }));
});
console.log('DIAGRAMS', JSON.stringify(diagramInfo, null, 2).slice(0, 6000));

const svgInfo = await page.evaluate(() =>
  [...document.querySelectorAll('svg')].map((s) => ({
    cls: s.getAttribute('class'),
    width: s.getAttribute('width'),
    height: s.getAttribute('height'),
    viewBox: s.getAttribute('viewBox'),
    nodes: s.querySelectorAll('[class*="__node"]').length,
    rect: s.getBoundingClientRect().toJSON(),
  })),
);
console.log('SVGS', JSON.stringify(svgInfo, null, 2).slice(0, 3000));

await page.goto(`${base}/#/map`, { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
const mapInfo = await page.evaluate(() => {
  const svg = document.querySelector('.map-canvas svg') || document.querySelector('svg');
  return {
    classes: [...document.querySelectorAll('[class*="map"]')].slice(0, 20).map((e) => e.className?.baseVal ?? e.className),
    nodeEls: document.querySelectorAll('[class*="map__node"], [class*="concept"]').length,
    svg: svg ? { html: svg.outerHTML.slice(0, 800), rect: svg.getBoundingClientRect().toJSON() } : null,
    pills: [...document.querySelectorAll('button, a')].map((e) => e.textContent?.trim()).filter(Boolean).slice(0, 40),
  };
});
console.log('MAP', JSON.stringify(mapInfo, null, 2).slice(0, 4000));

await browser.close();
