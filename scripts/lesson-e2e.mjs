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

await page.goto(`${base}/#/learn/c01-hello`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
const cards = page.locator('.lesson-diagram, .diagram-card, .cvz-diagram');
console.log('diagram wrappers:', await page.locator('.cvz-diagram').count());
const flowCard = page.locator('.cvz-diagram').first();
await flowCard.scrollIntoViewIfNeeded();
await page.waitForTimeout(300);
await flowCard.screenshot({ path: 'shots/lesson-flow.png' });
const traceCard = page.locator('.cvz-diagram').nth(1);
await traceCard.scrollIntoViewIfNeeded();
await page.waitForTimeout(300);
await traceCard.screenshot({ path: 'shots/lesson-trace.png' });

// click a flow node
const node = page.locator('.cvz-flow__node').filter({ hasText: '输出' }).first();
if (await node.count()) {
  await node.click();
  await page.waitForTimeout(400);
  const snippet = page.locator('.cvz-snippet, .cvz-diagram__snippet').first();
  console.log('snippet visible:', await snippet.count(), (await snippet.count()) ? (await snippet.innerText()).slice(0, 120) : '');
  await flowCard.screenshot({ path: 'shots/lesson-flow-selected.png' });
}

// quiz
const quiz = page.locator('.quiz').first();
if (await quiz.count()) {
  await quiz.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  const option = quiz.locator('button, label').filter({ hasText: 'main' }).first();
  const opts = quiz.locator('[role="radio"], button').filter({ hasNotText: '查看答案' });
  console.log('quiz option count approx:', await opts.count());
  await quiz.screenshot({ path: 'shots/lesson-quiz.png' });
}

// ==== lab class sample ====
await page.goto(`${base}/#/lab`, { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
await page.getByRole('button', { name: '示例库' }).click();
await page.waitForTimeout(500);
console.log('picker:', (await page.locator('.sample-picker, .modal, [role="dialog"]').first().innerText()).slice(0, 400));
const shape = page.getByRole('button', { name: /Shape：多态图形计算/ }).first();
if (await shape.count()) {
  await shape.click();
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: '分析代码' }).click();
  await page.waitForTimeout(1000);
  const classTab = page.getByRole('tab', { name: /类图/ }).first();
  await classTab.click();
  await page.waitForTimeout(700);
  await page.locator('.lab-workspace').screenshot({ path: 'shots/lab-classes.png' });
  const panel = page.locator('.lab-panel, .lab-analysis, .lab-workspace').first();
  console.log('classes panel:', (await page.locator('.lab-workspace').innerText()).slice(-1200));
}

console.log('ERRORS', JSON.stringify(errors));
await browser.close();
