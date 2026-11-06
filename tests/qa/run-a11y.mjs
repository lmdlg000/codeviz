/**
 * 可访问性 / 质量抽查
 * ------------------------------------------------------------------
 * 可访问名称、图片 alt、重复 id、aria 引用、SVG 节点可聚焦、Tab 焦点环、
 * tablist 方向键、弹窗焦点圈定、对比度抽样、prefers-reduced-motion。
 *
 * 运行：node tests/qa/run-a11y.mjs
 */
import {
  BASE,
  createRecorder,
  ensureDirs,
  gotoRoute,
  hasIssues,
  launchBrowser,
  newPage,
  printSummary,
  resetIssues,
  snapshotIssues,
  writeResult,
} from './harness.mjs';

const AREA = 'a11y';

const PAGES = [
  ['#/', 'home'],
  ['#/learn', 'learn'],
  ['#/learn/c01-hello', 'lesson'],
  ['#/map', 'map'],
  ['#/about', 'about'],
];

const CONTRAST_SELECTORS = [
  '.page-header__description',
  '.text-body',
  '.lesson-card__desc',
  '.sidebar__meta',
  '.eyebrow',
  '.muted',
  '.map-node__label',
  '.cvz-diag__hint',
  '.home-footnote',
  '.about-keys__table td',
];

async function main() {
  ensureDirs();
  const browser = await launchBrowser();
  const recorder = createRecorder(AREA);
  const details = {};

  const auditPage = () =>
    (async () => {
      return page.evaluate(() => {
        const visible = (el) => {
          const style = getComputedStyle(el);
          const rect = el.getBoundingClientRect();
          return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
        };
        const nameOf = (el) => {
          const aria = el.getAttribute('aria-label');
          if (aria && aria.trim()) return aria.trim();
          const labelledby = el.getAttribute('aria-labelledby');
          if (labelledby) {
            const parts = labelledby
              .split(/\s+/)
              .map((id) => document.getElementById(id)?.textContent?.trim() || '')
              .filter(Boolean);
            if (parts.join(' ').trim()) return parts.join(' ').trim();
          }
          const text = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
          if (text) return text;
          return (el.getAttribute('title') || '').trim();
        };
        const interactive = [...document.querySelectorAll('a[href], button, input, textarea, select, [role="button"]')];
        const unnamed = interactive
          .filter((el) => visible(el) && !nameOf(el))
          .map((el) => `${el.tagName.toLowerCase()}.${(el.className || '').toString().split(' ')[0]}`);
        const imgs = [...document.querySelectorAll('img')];
        const imgsWithoutAlt = imgs.filter((img) => !img.hasAttribute('alt')).length;
        const ids = [...document.querySelectorAll('[id]')].map((el) => el.id);
        const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
        const badAriaRefs = [];
        for (const el of document.querySelectorAll('[aria-labelledby], [aria-describedby]')) {
          const attr = el.hasAttribute('aria-labelledby') ? 'aria-labelledby' : 'aria-describedby';
          for (const id of (el.getAttribute(attr) || '').split(/\s+/).filter(Boolean)) {
            if (!document.getElementById(id)) badAriaRefs.push(`${attr}=${id}`);
          }
        }
        const positiveTabIndex = [...document.querySelectorAll('[tabindex]')].filter(
          (el) => Number(el.getAttribute('tabindex')) > 0,
        ).length;
        const svgButtons = [...document.querySelectorAll('svg [role="button"]')];
        const svgWithoutLabel = svgButtons.filter((el) => !el.getAttribute('aria-label')).length;
        const svgWithoutTabIndex = svgButtons.filter(
          (el) => !el.hasAttribute('tabindex') || Number(el.getAttribute('tabindex')) < 0,
        ).length;
        const h1 = document.querySelectorAll('h1').length;
        const landmarks = {
          main: document.querySelectorAll('main').length,
          nav: document.querySelectorAll('nav').length,
          skipLink: Boolean(document.querySelector('.skip-link')),
        };
        return {
          interactiveCount: interactive.length,
          unnamed: unnamed.slice(0, 15),
          imgs: imgs.length,
          imgsWithoutAlt,
          duplicateIds: duplicateIds.slice(0, 10),
          badAriaRefs: badAriaRefs.slice(0, 10),
          positiveTabIndex,
          svgButtons: svgButtons.length,
          svgWithoutLabel,
          svgWithoutTabIndex,
          h1,
          landmarks,
        };
      });
    })();

  let page;

  for (const [route, name] of PAGES) {
    const session = await newPage(browser, { viewport: { width: 1440, height: 900 } });
    page = session.page;
    await gotoRoute(page, route, { waitMs: 650 });
    const audit = await auditPage();
    details[name] = audit;
    recorder.check(`${name}/names`, audit.unnamed.length === 0, audit.unnamed.join(', '));
    recorder.check(`${name}/img-alt`, audit.imgsWithoutAlt === 0, `${audit.imgsWithoutAlt} 张图片缺 alt`);
    recorder.check(`${name}/unique-ids`, audit.duplicateIds.length === 0, audit.duplicateIds.join(', '));
    recorder.check(`${name}/aria-refs`, audit.badAriaRefs.length === 0, audit.badAriaRefs.join(', '));
    recorder.check(`${name}/no-positive-tabindex`, audit.positiveTabIndex === 0, String(audit.positiveTabIndex));
    recorder.check(`${name}/landmarks`, audit.landmarks.main === 1 && audit.landmarks.nav >= 1 && audit.landmarks.skipLink, JSON.stringify(audit.landmarks));
    recorder.check(`${name}/h1`, audit.h1 === 1, String(audit.h1));

    // Tab 焦点环抽查：真实键盘 Tab 前 8 个可聚焦元素
    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      document.body.tabIndex = -1;
      document.body.focus();
    });
    const focusInfo = [];
    for (let index = 0; index < 8; index += 1) {
      await page.keyboard.press('Tab');
      await page.waitForTimeout(60);
      const item = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body || el === document.documentElement) return null;
        const style = getComputedStyle(el);
        return {
          tag: el.tagName,
          label: (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40),
          outline: `${style.outlineStyle} ${style.outlineWidth}`,
          rect: Math.round(el.getBoundingClientRect().top),
        };
      });
      if (item) focusInfo.push(item);
    }
    recorder.check(`${name}/tab-sequence`, focusInfo.length >= 3, JSON.stringify(focusInfo.slice(0, 3)));
    const noOutline = focusInfo.filter((item) => item.outline.includes('none') || item.outline.includes('0px'));
    recorder.check(`${name}/focus-visible`, noOutline.length === 0, JSON.stringify(noOutline.slice(0, 3)));
    await session.context.close();
  }

  // 实验室：tablist 方向键 + SVG 节点可聚焦 + 分析后可访问名称
  {
    const session = await newPage(browser, { viewport: { width: 1440, height: 900 } });
    page = session.page;
    const issues = session.issues;
    await gotoRoute(page, '#/lab', { waitMs: 800 });
    await page.getByRole('button', { name: '分析代码' }).click();
    await page.waitForTimeout(900);
    await page.getByRole('tab', { name: '流程图' }).click();
    await page.waitForTimeout(500);
    const labAudit = await auditPage();
    details.lab = labAudit;
    recorder.check('lab/names', labAudit.unnamed.length === 0, labAudit.unnamed.join(', '));
    recorder.check(
      'lab/svg-buttons',
      labAudit.svgButtons > 0 && labAudit.svgWithoutLabel === 0 && labAudit.svgWithoutTabIndex === 0,
      JSON.stringify({ total: labAudit.svgButtons, noLabel: labAudit.svgWithoutLabel, noTab: labAudit.svgWithoutTabIndex }),
    );
    // tablist 方向键：聚焦当前选中 tab，ArrowRight 应切到下一个
    const selectedTab = page.locator('[role="tab"][aria-selected="true"]');
    await selectedTab.focus();
    const beforeTab = (await selectedTab.innerText()).trim();
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(250);
    const afterArrow = await page.evaluate(() => {
      const selected = document.querySelector('[role="tab"][aria-selected="true"]');
      return {
        tab: selected?.textContent?.trim() || '',
        focused: document.activeElement?.getAttribute('role') || '',
      };
    });
    recorder.check('lab/tablist-arrow', afterArrow.tab !== beforeTab && afterArrow.focused === 'tab', JSON.stringify({ beforeTab, ...afterArrow }));

    // 对比度抽样（浅色 + 深色）
    const contrast = await page.evaluate((selectors) => {
      const parse = (color) => {
        const match = color.match(/rgba?\(([^)]+)\)/);
        if (!match) return null;
        const parts = match[1].split(',').map((value) => Number(value.trim()));
        return { r: parts[0], g: parts[1], b: parts[2], a: parts[3] ?? 1 };
      };
      const blend = (fg, bg) => ({
        r: fg.r * fg.a + bg.r * (1 - fg.a),
        g: fg.g * fg.a + bg.g * (1 - fg.a),
        b: fg.b * fg.a + bg.b * (1 - fg.a),
        a: 1,
      });
      const background = (el) => {
        let node = el;
        while (node && node !== document.documentElement) {
          const bg = parse(getComputedStyle(node).backgroundColor);
          if (bg && bg.a > 0.01) return bg.a < 1 ? blend(bg, { r: 255, g: 255, b: 255, a: 1 }) : bg;
          node = node.parentElement;
        }
        return { r: 255, g: 255, b: 255, a: 1 };
      };
      const luminance = ({ r, g, b }) => {
        const channel = (value) => {
          const v = value / 255;
          return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
      };
      const ratio = (a, b) => {
        const l1 = luminance(a);
        const l2 = luminance(b);
        return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      };
      const results = [];
      for (const selector of selectors) {
        const el = document.querySelector(selector);
        if (!el || !el.textContent.trim()) continue;
        const style = getComputedStyle(el);
        const fg = parse(style.color);
        if (!fg) continue;
        const bg = background(el);
        const size = parseFloat(style.fontSize);
        const large = size >= 24 || (size >= 18.66 && Number(style.fontWeight) >= 700);
        results.push({
          selector,
          ratio: Math.round(ratio(fg, bg) * 100) / 100,
          fontSize: size,
          large,
          color: style.color,
        });
      }
      return results;
    }, CONTRAST_SELECTORS);
    details.contrastLight = contrast;
    const lowLight = contrast.filter((item) => item.ratio < (item.large ? 3 : 4.5));
    recorder.check('lab/contrast-light', lowLight.length === 0, JSON.stringify(lowLight));

    await page.locator('.sidebar__theme').click();
    await page.waitForTimeout(400);
    const contrastDark = await page.evaluate((selectors) => {
      const parse = (color) => {
        const match = color.match(/rgba?\(([^)]+)\)/);
        if (!match) return null;
        const parts = match[1].split(',').map((value) => Number(value.trim()));
        return { r: parts[0], g: parts[1], b: parts[2], a: parts[3] ?? 1 };
      };
      const blend = (fg, bg) => ({
        r: fg.r * fg.a + bg.r * (1 - fg.a),
        g: fg.g * fg.a + bg.g * (1 - fg.a),
        b: fg.b * fg.a + bg.b * (1 - fg.a),
        a: 1,
      });
      const background = (el) => {
        let node = el;
        while (node && node !== document.documentElement) {
          const bg = parse(getComputedStyle(node).backgroundColor);
          if (bg && bg.a > 0.01) return bg.a < 1 ? blend(bg, { r: 10, g: 15, b: 29, a: 1 }) : bg;
          node = node.parentElement;
        }
        return { r: 10, g: 15, b: 29, a: 1 };
      };
      const luminance = ({ r, g, b }) => {
        const channel = (value) => {
          const v = value / 255;
          return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
      };
      const ratio = (a, b) => {
        const l1 = luminance(a);
        const l2 = luminance(b);
        return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      };
      const results = [];
      for (const selector of selectors) {
        const el = document.querySelector(selector);
        if (!el || !el.textContent.trim()) continue;
        const style = getComputedStyle(el);
        const fg = parse(style.color);
        if (!fg) continue;
        const bg = background(el);
        const size = parseFloat(style.fontSize);
        const large = size >= 24 || (size >= 18.66 && Number(style.fontWeight) >= 700);
        results.push({ selector, ratio: Math.round(ratio(fg, bg) * 100) / 100, fontSize: size, large });
      }
      return results;
    }, CONTRAST_SELECTORS);
    details.contrastDark = contrastDark;
    const lowDark = contrastDark.filter((item) => item.ratio < (item.large ? 3 : 4.5));
    recorder.check('lab/contrast-dark', lowDark.length === 0, JSON.stringify(lowDark));
    await page.waitForTimeout(200);
    const snapshot = snapshotIssues(issues);
    recorder.check('lab/console-clean', !hasIssues(snapshot), JSON.stringify(snapshot).slice(0, 400));
    await session.context.close();
  }

  // prefers-reduced-motion：页面不崩溃、无 console error
  {
    const session = await newPage(browser, {
      viewport: { width: 1440, height: 900 },
      reducedMotion: 'reduce',
    });
    page = session.page;
    resetIssues(session.issues);
    await gotoRoute(page, '#/', { waitMs: 700 });
    await gotoRoute(page, '#/learn/c05-loops', { waitMs: 700 });
    const reduced = await page.evaluate(() => ({
      scrollBehavior: getComputedStyle(document.documentElement).scrollBehavior,
      animationDuration: getComputedStyle(document.querySelector('.home-cta') || document.body).animationDuration,
      media: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    }));
    details.reducedMotion = reduced;
    recorder.check('reduced-motion/match', reduced.media === true, JSON.stringify(reduced));
    recorder.check('reduced-motion/scroll', reduced.scrollBehavior === 'auto', JSON.stringify(reduced));
    const snapshot = snapshotIssues(session.issues);
    recorder.check('reduced-motion/console-clean', !hasIssues(snapshot), JSON.stringify(snapshot).slice(0, 400));
    await session.context.close();
  }

  await browser.close();
  const failed = recorder.checks.filter((entry) => !entry.ok);
  writeResult(AREA, { base: BASE, details, checks: recorder.checks, failedChecks: failed });
  printSummary('a11y', recorder);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
