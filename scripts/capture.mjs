/**
 * 无头 Edge 截图 + 控制台错误检查（开发/验收用）
 * 用法：node scripts/capture.mjs [baseUrl] [outDir] [route ...]
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const base = process.argv[2] || 'http://127.0.0.1:5178';
const outDir = process.argv[3] || path.resolve('shots');
const routes = process.argv.slice(4);
const targets = routes.length
  ? routes
  : ['#/', '#/learn', '#/lab', '#/map', '#/about'];

fs.mkdirSync(outDir, { recursive: true });

const edgePaths = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];
const executablePath = edgePaths.find((p) => fs.existsSync(p));

const browser = await chromium.launch({
  headless: true,
  executablePath,
  args: ['--no-sandbox', '--disable-gpu'],
});

const summary = [];
for (const route of targets) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('requestfailed', (req) => {
    if (!req.url().includes('favicon')) errors.push(`requestfailed: ${req.url()} ${req.failure()?.errorText}`);
  });

  const url = `${base}/${route}`;
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(700);
    const slug = (route.replace(/[#/?=&%]+/g, '_').replace(/^_+|_+$/g, '') || 'home').slice(0, 60);
    const title = await page.title();
    const file = path.join(outDir, `${slug}.png`);
    await page.screenshot({ path: file, fullPage: true });
    const bodyText = (await page.locator('body').innerText()).slice(0, 2000);
    summary.push({ route, title, file, errors, text: bodyText });
  } catch (error) {
    summary.push({ route, error: String(error), errors });
  }
  await page.close();
}

await browser.close();
console.log(JSON.stringify(summary, null, 2));
