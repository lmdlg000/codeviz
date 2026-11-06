/**
 * CodeViz 独立验收（QA）共享工具
 * ------------------------------------------------------------------
 * 只读产品代码：通过真实 Edge（playwright-core）访问 dev server，
 * 采集控制台错误、布局溢出、截图，并把结果写入 docs/qa/**。
 *
 * 用法：由 tests/qa/*.mjs 引用。
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export const ROOT = path.resolve(HERE, '..', '..');
export const BASE = process.env.QA_BASE || 'http://127.0.0.1:5178';
export const SHOTS_ROOT = path.join(ROOT, 'docs', 'qa', 'shots');
export const RESULTS_ROOT = path.join(ROOT, 'docs', 'qa', 'results');

export const EDGE_PATHS = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];

export function ensureDirs(...subdirs) {
  const dirs = [RESULTS_ROOT, SHOTS_ROOT, ...subdirs.map((sub) => path.join(SHOTS_ROOT, sub))];
  for (const dir of dirs) fs.mkdirSync(dir, { recursive: true });
}

export async function launchBrowser() {
  const executablePath = EDGE_PATHS.find((candidate) => fs.existsSync(candidate));
  if (!executablePath) throw new Error('未找到 Microsoft Edge，可执行文件路径不存在');
  return chromium.launch({
    headless: true,
    executablePath,
    args: ['--no-sandbox', '--disable-gpu', '--font-render-hinting=none'],
  });
}

/** 新建带问题采集的页面。 */
export async function newPage(browser, options = {}) {
  const {
    viewport = { width: 1440, height: 900 },
    dark = false,
    reducedMotion = 'no-preference',
    storage = null,
  } = options;
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    colorScheme: dark ? 'dark' : 'light',
    locale: 'zh-CN',
    reducedMotion,
  });
  if (storage) {
    await context.addInitScript((seed) => {
      try {
        for (const [key, value] of Object.entries(seed)) window.localStorage.setItem(key, value);
      } catch {
        /* 忽略 */
      }
    }, storage);
  }
  const page = await context.newPage();
  const issues = attachIssues(page);
  return { context, page, issues };
}

export function attachIssues(page) {
  const issues = {
    consoleErrors: [],
    consoleWarnings: [],
    pageErrors: [],
    requestFailures: [],
  };
  page.on('console', (msg) => {
    const type = msg.type();
    const text = msg.text();
    if (type === 'error') issues.consoleErrors.push(text);
    else if (type === 'warning') issues.consoleWarnings.push(text);
  });
  page.on('pageerror', (error) => {
    issues.pageErrors.push(String(error?.stack || error?.message || error));
  });
  page.on('requestfailed', (request) => {
    const url = request.url();
    if (url.includes('favicon')) return;
    issues.requestFailures.push(`${url} :: ${request.failure()?.errorText ?? 'unknown'}`);
  });
  return issues;
}

export function resetIssues(issues) {
  issues.consoleErrors.length = 0;
  issues.consoleWarnings.length = 0;
  issues.pageErrors.length = 0;
  issues.requestFailures.length = 0;
}

export function snapshotIssues(issues) {
  return {
    consoleErrors: [...new Set(issues.consoleErrors)],
    consoleWarnings: [...new Set(issues.consoleWarnings)],
    pageErrors: [...new Set(issues.pageErrors)],
    requestFailures: [...new Set(issues.requestFailures)],
  };
}

export function hasIssues(snapshot) {
  return (
    snapshot.consoleErrors.length > 0 ||
    snapshot.pageErrors.length > 0 ||
    snapshot.requestFailures.length > 0
  );
}

/** 打开 hash 路由，等待应用渲染。 */
export async function gotoRoute(page, route, options = {}) {
  const { waitMs = 500, timeout = 30000 } = options;
  const url = `${BASE}/${route}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
  await page.waitForFunction(
    () => {
      const main = document.getElementById('main-content');
      return Boolean(main && main.children.length > 0);
    },
    null,
    { timeout: 15000 },
  );
  await page.waitForTimeout(waitMs);
}

/** 通过 hashchange 在应用内切换路由（不整页刷新）。 */
export async function navHash(page, route, waitMs = 450) {
  await page.evaluate((next) => {
    window.location.hash = next;
  }, route);
  await page.waitForTimeout(waitMs);
}

export async function reload(page, waitMs = 800) {
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => {
      const main = document.getElementById('main-content');
      return Boolean(main && main.children.length > 0);
    },
    null,
    { timeout: 15000 },
  );
  await page.waitForTimeout(waitMs);
}

/** 页面布局审计：横向滚动、越界元素、截断文本、基础内容。 */
export async function auditLayout(page) {
  return page.evaluate(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const doc = document.documentElement;
    const body = document.body;
    const pageScrollWidth = Math.max(doc.scrollWidth, body.scrollWidth);
    const pageScrollHeight = Math.max(doc.scrollHeight, body.scrollHeight);
    const horizontalScroll = pageScrollWidth > vw + 1;

    const scrollXBefore = window.scrollX;
    window.scrollTo(99999, window.scrollY);
    const scrollX = window.scrollX;
    window.scrollTo(scrollXBefore, window.scrollY);
    const canScrollHorizontally = scrollX > 0;

    const skipTags = new Set(['SCRIPT', 'STYLE', 'LINK', 'META', 'TITLE', 'HEAD', 'BODY', 'HTML']);
    const offenders = [];
    const truncated = [];
    const scrollContainers = new Map();

    const textOf = (el) =>
      (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 70);
    const selectorOf = (el) => {
      const cls = typeof el.className === 'string' ? el.className : el.getAttribute('class') || '';
      return `${el.tagName.toLowerCase()}${cls ? `.${cls.split(/\s+/).filter(Boolean).slice(0, 2).join('.')}` : ''}`;
    };

    for (const el of document.querySelectorAll('body *')) {
      const tag = el.tagName;
      if (skipTags.has(tag)) continue;
      if (el.closest('svg') && tag.toLowerCase() !== 'svg') continue;
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      if (Number(style.opacity) === 0) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) continue;

      let scroller = null;
      let parent = el.parentElement;
      while (parent && parent !== body) {
        const ps = getComputedStyle(parent);
        if (['auto', 'scroll', 'hidden', 'clip'].includes(ps.overflowX)) {
          scroller = parent;
          break;
        }
        parent = parent.parentElement;
      }

      if (rect.right > vw + 2 || rect.left < -2) {
        if (!scroller) {
          offenders.push({
            selector: selectorOf(el),
            text: textOf(el),
            left: Math.round(rect.left),
            right: Math.round(rect.right),
            width: Math.round(rect.width),
          });
        }
      }

      if (scroller) {
        const key = selectorOf(scroller);
        const entry = scrollContainers.get(key) || {
          selector: key,
          scrollWidth: scroller.scrollWidth,
          clientWidth: scroller.clientWidth,
        };
        if (scroller.scrollWidth > scroller.clientWidth + 1) scrollContainers.set(key, entry);
      }

      const isBlocky = ['block', 'flex', 'grid', 'list-item', 'table-cell', 'inline-block'].includes(
        style.display,
      );
      if (
        isBlocky &&
        el.clientWidth > 8 &&
        el.scrollWidth > el.clientWidth + 3 &&
        ['hidden', 'clip'].includes(style.overflowX) &&
        el.textContent.trim().length > 0 &&
        el.children.length <= 4
      ) {
        truncated.push({
          selector: selectorOf(el),
          text: textOf(el),
          clientWidth: el.clientWidth,
          scrollWidth: el.scrollWidth,
        });
      }
    }

    const h1s = [...document.querySelectorAll('h1')].map((el) => (el.textContent || '').trim());
    const main = document.getElementById('main-content');
    return {
      viewport: { width: vw, height: vh },
      theme: doc.dataset.theme || '',
      title: document.title,
      pageScrollWidth,
      pageScrollHeight,
      horizontalScroll,
      canScrollHorizontally,
      offenders: offenders.slice(0, 25),
      truncated: truncated.slice(0, 25),
      scrollContainers: [...scrollContainers.values()].slice(0, 15),
      h1: h1s,
      mainTextLength: main ? (main.innerText || '').replace(/\s+/g, ' ').trim().length : 0,
      bodyTextLength: (body.innerText || '').length,
      hasMain: Boolean(main),
      headings: {
        h1: document.querySelectorAll('h1').length,
        h2: document.querySelectorAll('h2').length,
        h3: document.querySelectorAll('h3').length,
      },
    };
  });
}

export async function screenshot(page, area, name, options = {}) {
  const { fullPage = false } = options;
  const dir = path.join(SHOTS_ROOT, area);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${name}.png`);
  await page.screenshot({ path: file, fullPage, animations: 'disabled' });
  return path.relative(ROOT, file).replace(/\\/g, '/');
}

export async function toastMessages(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('.toast__message')].map((el) => (el.textContent || '').trim()),
  );
}

export async function waitForToast(page, matcher, timeout = 4000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const messages = await toastMessages(page);
    const hit = messages.find((message) => (matcher instanceof RegExp ? matcher.test(message) : message.includes(matcher)));
    if (hit) return hit;
    await page.waitForTimeout(120);
  }
  return null;
}

export async function waitForAnalysis(page, timeout = 8000) {
  await page.waitForFunction(
    () => {
      const status = document.querySelector('.lab-status');
      if (!status) return false;
      const text = status.textContent || '';
      return text.includes('已分析') || text.includes('代码超过');
    },
    null,
    { timeout },
  );
  await page.waitForTimeout(200);
}

export async function clearToastLayer(page) {
  await page.evaluate(() => {
    const layer = document.querySelector('.toast-layer');
    layer?.replaceChildren();
  });
}

export function createRecorder(area) {
  const checks = [];
  const check = (id, ok, detail = '') => {
    const entry = { area, id, ok: Boolean(ok), detail };
    checks.push(entry);
    return entry.ok;
  };
  const add = (id, detail = '') => check(id, true, detail);
  const fail = (id, detail = '') => check(id, false, detail);
  const countFailures = () => checks.filter((entry) => !entry.ok).length;
  return { area, checks, check, add, fail, countFailures };
}

export function writeResult(area, payload) {
  ensureDirs();
  const file = path.join(RESULTS_ROOT, `${area}.json`);
  fs.writeFileSync(file, JSON.stringify({ generatedAt: new Date().toISOString(), ...payload }, null, 2), 'utf8');
  return file;
}

export function readResult(area) {
  const file = path.join(RESULTS_ROOT, `${area}.json`);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

export function printSummary(name, recorder) {
  const failed = recorder.checks.filter((entry) => !entry.ok);
  console.log(`\n[${name}] checks=${recorder.checks.length} failed=${failed.length}`);
  for (const entry of failed.slice(0, 40)) {
    console.log(`  FAIL ${entry.id} :: ${entry.detail}`);
  }
}

/** 通用：按 role/名称点击，失败返回 false。 */
export async function safeClick(page, locator, timeout = 4000) {
  try {
    await locator.first().click({ timeout });
    return true;
  } catch {
    return false;
  }
}

export async function textOf(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    return el ? (el.innerText || el.textContent || '').trim() : null;
  }, selector);
}

export const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
};
