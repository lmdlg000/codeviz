import { chromium } from 'playwright-core';
import fs from 'node:fs';

const base = 'http://127.0.0.1:5178';
const executablePath = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => fs.existsSync(p));
const browser = await chromium.launch({ headless: true, executablePath, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));

await page.goto(`${base}/#/lab`, { waitUntil: 'networkidle' });
await page.waitForTimeout(800);

// 分析
await page.getByRole('button', { name: '分析代码' }).click();
await page.waitForTimeout(1200);
console.log('after analyze text:', (await page.locator('.lab-workspace').innerText()).slice(0, 800));

// 概览截图
await page.locator('.lab-workspace').screenshot({ path: 'shots/lab-overview.png' });

// 逐个 tab
for (const tab of ['流程图', '调用图', '类图', '内存', '单步执行', '诊断']) {
  const btn = page.getByRole('tab', { name: new RegExp(tab) }).first();
  if (await btn.count()) {
    await btn.click();
  } else {
    await page.getByRole('button', { name: new RegExp(tab) }).first().click();
  }
  await page.waitForTimeout(600);
  const slug = { 流程图: 'flow', 调用图: 'calls', 类图: 'classes', 内存: 'memory', 单步执行: 'trace', 诊断: 'diag' }[tab];
  await page.locator('.lab-workspace').screenshot({ path: `shots/lab-${slug}.png` });
  const text = (await page.locator('.lab-workspace').innerText()).replace(/\n+/g, ' | ').slice(0, 500);
  console.log(`TAB ${tab}:`, text);
}

// 点运行追踪
const traceTabBtn = page.getByRole('tab', { name: /单步执行/ }).first();
if (await traceTabBtn.count()) await traceTabBtn.click();
await page.waitForTimeout(300);
const runBtn = page.getByRole('button', { name: /运行追踪/ }).first();
if (await runBtn.count()) {
  await runBtn.click();
  await page.waitForTimeout(800);
  await page.locator('.lab-workspace').screenshot({ path: 'shots/lab-trace-player.png' });
  console.log('trace:', (await page.locator('.lab-workspace').innerText()).replace(/\n+/g, ' | ').slice(0, 700));
}

console.log('ERRORS:', JSON.stringify(errors));
await browser.close();

