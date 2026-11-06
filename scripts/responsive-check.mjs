import { chromium } from 'playwright-core';
import fs from 'node:fs';

const base = 'http://127.0.0.1:5178';
const executablePath = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => fs.existsSync(p));
fs.mkdirSync('shots/dark', { recursive: true });
fs.mkdirSync('shots/mobile', { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath, args: ['--no-sandbox'] });

const errors = [];
async function open(path, viewport, opts = {}) {
  const page = await browser.newPage({ viewport });
  if (opts.dark) await page.addInitScript(() => localStorage.setItem('codeviz.theme', 'dark'));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${path}: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`${path}: PAGEERROR ${e.message}`));
  await page.goto(`${base}/${path}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
    title: document.title,
    h1: document.querySelector('h1')?.textContent?.slice(0, 80),
  }));
  return { page, metrics };
}

// dark desktop
for (const [name, route] of [
  ['home', '#/'],
  ['learn', '#/learn'],
  ['lesson', '#/learn/c05-loops'],
  ['map', '#/map'],
  ['about', '#/about'],
]) {
  const { page, metrics } = await open(route, { width: 1440, height: 900 }, { dark: true });
  await page.screenshot({ path: `shots/dark/${name}.png`, fullPage: true });
  console.log('DARK', name, metrics);
  await page.close();
}

// dark lab with analysis
{
  const { page, metrics } = await open('#/lab', { width: 1440, height: 900 }, { dark: true });
  await page.getByRole('button', { name: '分析代码' }).click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'shots/dark/lab.png', fullPage: true });
  console.log('DARK lab', metrics);
  await page.close();
}

// mobile
for (const [name, route] of [
  ['home', '#/'],
  ['learn', '#/learn'],
  ['lesson', '#/learn/c01-hello'],
  ['lab', '#/lab'],
  ['map', '#/map'],
  ['about', '#/about'],
]) {
  const { page, metrics } = await open(route, { width: 390, height: 844 });
  await page.screenshot({ path: `shots/mobile/${name}.png`, fullPage: true });
  console.log('MOBILE', name, metrics);
  await page.close();
}

console.log('ERRORS', JSON.stringify(errors, null, 2));
await browser.close();
