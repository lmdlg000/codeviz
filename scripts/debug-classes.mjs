import { chromium } from 'playwright-core';
import fs from 'node:fs';

const base = 'http://127.0.0.1:5178';
const executablePath = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => fs.existsSync(p));
const browser = await chromium.launch({ headless: true, executablePath, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(`${base}/#/learn/c01-hello`, { waitUntil: 'networkidle' });
const result = await page.evaluate(async () => {
  const mod = await import('/src/engine/index.ts');
  const sampleMod = await import('/src/data/samples/cpp.ts');
  const code = sampleMod.default.find((s) => s.id === 'shape-polymorphism').code;
  const r = mod.analyzeCode(code);
  return {
    classes: r.classes,
    flows: r.flowcharts.map((f) => ({ id: f.functionId, count: f.nodeCount })),
    diags: r.diagnostics,
  };
});
console.log(JSON.stringify(result, null, 2).slice(0, 12000));
await browser.close();
