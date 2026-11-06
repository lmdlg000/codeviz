/**
 * 页面与响应式扫描
 * ------------------------------------------------------------------
 * 覆盖全部路由 ×（桌面 1440×900 / 移动 390×844）×（浅色 / 深色），
 * 采集：控制台错误、页面异常、水平溢出、越界元素、内容空壳、占位文案、
 * 关键组件数量与图形渲染，并保存截图到 docs/qa/shots/routes/。
 *
 * 运行：node tests/qa/run-routes.mjs
 */
import {
  BASE,
  VIEWPORTS,
  createRecorder,
  ensureDirs,
  gotoRoute,
  hasIssues,
  launchBrowser,
  newPage,
  printSummary,
  resetIssues,
  screenshot,
  snapshotIssues,
  auditLayout,
  writeResult,
} from './harness.mjs';

const LESSONS = [
  ['c01-hello', '初识 C'],
  ['c02-data', '数据与变量'],
  ['c03-operators', '运算符'],
  ['c04-selection', '选择结构'],
  ['c05-loops', '循环结构'],
  ['c06-arrays', '数组与字符串'],
  ['c07-functions', '函数与递归'],
  ['c08-pointers', '指针'],
  ['c09-structs', '结构体'],
  ['c10-files', '文件'],
  ['c11-classes', '类与对象'],
  ['c12-inheritance', '继承与多态'],
  ['c13-templates', '模板'],
];

function routesForAll() {
  const routes = [
    { route: '#/', name: 'home', title: 'CodeViz · C/C++ 图解工坊', kind: 'home' },
    { route: '#/learn', name: 'learn', title: '课程 · CodeViz', kind: 'learn' },
  ];
  for (const [id, titlePart] of LESSONS) {
    routes.push({
      route: `#/learn/${id}`,
      name: `lesson-${id}`,
      title: null,
      kind: 'lesson',
      lessonId: id,
      titlePart,
    });
  }
  routes.push(
    { route: '#/lab', name: 'lab', title: '代码实验室 · CodeViz', kind: 'lab' },
    { route: '#/map', name: 'map', title: '知识图谱 · CodeViz', kind: 'map' },
    { route: '#/about', name: 'about', title: '关于 · CodeViz', kind: 'about' },
    { route: '#/nope', name: 'notfound', title: '页面未找到 · CodeViz', kind: 'notfound' },
    {
      route: '#/learn/not-a-lesson',
      name: 'lesson-notfound',
      title: '页面未找到 · CodeViz',
      kind: 'lesson-notfound',
    },
  );
  return routes;
}

const ROUTES = routesForAll();
const SCREENSHOT_VIEWPORT_ONLY = new Set([
  'c02-data',
  'c03-operators',
  'c04-selection',
  'c06-arrays',
  'c07-functions',
  'c09-structs',
  'c10-files',
  'c12-inheritance',
  'c13-templates',
]);

/** 从页面一次性读取断言所需的 DOM 信息（比多次 locator 查询快且一致）。 */
async function collectDom(page) {
  return page.evaluate(() => {
    const count = (selector) => document.querySelectorAll(selector).length;
    const text = (selector) => {
      const el = document.querySelector(selector);
      return el ? (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim() : '';
    };
    return {
      counts: {
        '.capability-card': count('.capability-card'),
        '.path-card': count('.path-card'),
        '.home-cta': count('.home-cta'),
        '.lesson-card': count('.lesson-card'),
        '.learn-chapter': count('.learn-chapter'),
        '.learn-banner': count('.learn-banner'),
        '.objectives__item': count('.objectives__item'),
        '.key-points__item': count('.key-points__item'),
        '.diagram-card': count('.diagram-card'),
        '.code-block': count('.code-block'),
        '.quiz__question': count('.quiz__question'),
        '.lesson-toc__list button': count('.lesson-toc__list button'),
        '.lesson-blocks h2[id^="lesson-section-"]': count('.lesson-blocks h2[id^="lesson-section-"]'),
        '.diagram-card__body .cvz-empty': count('.diagram-card__body .cvz-empty'),
        '.diagram-card__body svg': count('.diagram-card__body svg'),
        '.diagram-card__body .cvz-trace': count('.diagram-card__body .cvz-trace'),
        '.lab-status': count('.lab-status'),
        '.lab-file-chip__name': count('.lab-file-chip__name'),
        '.cm-editor': count('.cm-editor'),
        '.lab-panel': count('.lab-panel'),
        '.lab-workspace': count('.lab-workspace'),
        '.map-node': count('.map-node'),
        '.map-mobile-item': count('.map-mobile-item'),
        '.map-detail': count('.map-detail'),
        '.about-ref': count('.about-ref'),
        '.about-keys__table tbody tr': count('.about-keys__table tbody tr'),
        '.notfound__code': count('.notfound__code'),
        '.sidebar': count('.sidebar'),
        '.mobile-topbar': count('.mobile-topbar'),
      },
      texts: {
        '.home-hero__title': text('.home-hero__title'),
        '.lesson-hero__title': text('.lesson-hero__title'),
        '.lab-status': text('.lab-status'),
        '.lab-file-chip__name': text('.lab-file-chip__name'),
        '.notfound__code': text('.notfound__code'),
        '.map-detail__title': text('.map-detail__title'),
      },
      sidebarVisible: (() => {
        const el = document.querySelector('.sidebar');
        if (!el) return false;
        const style = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 100;
      })(),
      mobileTopbarVisible: (() => {
        const el = document.querySelector('.mobile-topbar');
        if (!el) return false;
        const style = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.height > 10;
      })(),
    };
  });
}

function buildRouteChecks(routeDef, audit, dom, issues) {
  const failures = [];
  const details = {};

  if (!audit.hasMain) failures.push('缺少 main#main-content');
  if (audit.headings.h1 !== 1) failures.push(`h1 数量应为 1，实际 ${audit.headings.h1}`);
  if (audit.mainTextLength < 80) failures.push(`主内容文字过少（${audit.mainTextLength} 字符）`);
  if (audit.horizontalScroll) {
    failures.push(`页面出现水平滚动（scrollWidth=${audit.pageScrollWidth} > viewport=${audit.viewport.width}）`);
  }
  if (audit.canScrollHorizontally) failures.push('页面可实际横向滚动');
  if (audit.offenders.length > 0) {
    failures.push(
      `${audit.offenders.length} 个元素横向越界：${audit.offenders
        .slice(0, 3)
        .map((item) => `${item.selector}(${item.left}..${item.right})`)
        .join(', ')}`,
    );
  }
  if (hasIssues(issues)) {
    if (issues.consoleErrors.length) failures.push(`console error ×${issues.consoleErrors.length}`);
    if (issues.pageErrors.length) failures.push(`pageerror ×${issues.pageErrors.length}`);
    if (issues.requestFailures.length) failures.push(`请求失败 ×${issues.requestFailures.length}`);
  }
  details.consoleWarnings = issues.consoleWarnings;

  const bodyText = dom.bodyText || '';

  if (routeDef.kind === 'home') {
    const capability = dom.counts['.capability-card'];
    const pathCards = dom.counts['.path-card'];
    details.capability = capability;
    details.pathCards = pathCards;
    if (capability !== 6) failures.push(`能力卡片数应为 6，实际 ${capability}`);
    if (pathCards !== 4) failures.push(`学习路径卡片数应为 4，实际 ${pathCards}`);
    if (!dom.counts['.home-cta']) failures.push('缺少底部 CTA');
    if (!dom.texts['.home-hero__title'].includes('看得见的图')) {
      failures.push(`Hero 标题异常：${dom.texts['.home-hero__title']}`);
    }
    if (!bodyText.includes('13 节课程')) failures.push('首页未显示「13 节课程」');
  }

  if (routeDef.kind === 'learn') {
    const cards = dom.counts['.lesson-card'];
    const chapters = dom.counts['.learn-chapter'];
    details.cards = cards;
    details.chapters = chapters;
    if (cards !== 13) failures.push(`课程卡应为 13，实际 ${cards}`);
    if (chapters !== 4) failures.push(`章节 section 应为 4，实际 ${chapters}`);
    if (!bodyText.includes('已完成 0 / 13')) failures.push('总进度文案不是「已完成 0 / 13」');
    if (!dom.counts['.learn-banner']) failures.push('缺少底部实验室横幅');
  }

  if (routeDef.kind === 'lesson') {
    const objectives = dom.counts['.objectives__item'];
    const keyPoints = dom.counts['.key-points__item'];
    const diagrams = dom.counts['.diagram-card'];
    const codeBlocks = dom.counts['.code-block'];
    const quizQuestions = dom.counts['.quiz__question'];
    const tocButtons = dom.counts['.lesson-toc__list button'];
    const h2Anchors = dom.counts['.lesson-blocks h2[id^="lesson-section-"]'];
    const emptyDiagrams = dom.counts['.diagram-card__body .cvz-empty'];
    const svgCount = dom.counts['.diagram-card__body svg'];
    const tracePlayers = dom.counts['.diagram-card__body .cvz-trace'];
    details.objectives = objectives;
    details.keyPoints = keyPoints;
    details.diagrams = diagrams;
    details.codeBlocks = codeBlocks;
    details.quizQuestions = quizQuestions;
    details.tocButtons = tocButtons;
    details.h2Anchors = h2Anchors;
    details.emptyDiagrams = emptyDiagrams;
    const title = dom.texts['.lesson-hero__title'];
    if (!title || !title.includes(routeDef.titlePart)) {
      failures.push(`课程标题异常：${title}（应包含「${routeDef.titlePart}」）`);
    }
    if (objectives < 3 || objectives > 5) failures.push(`学习目标应为 3–5 条，实际 ${objectives}`);
    if (keyPoints < 3 || keyPoints > 5) failures.push(`关键要点应为 3–5 条，实际 ${keyPoints}`);
    if (diagrams < 2) failures.push(`图形块少于 2 个，实际 ${diagrams}`);
    if (codeBlocks < 3) failures.push(`代码块少于 3 个，实际 ${codeBlocks}`);
    if (quizQuestions < 2 || quizQuestions > 4) failures.push(`测验题应为 2–4 道，实际 ${quizQuestions}`);
    if (tocButtons !== h2Anchors) {
      failures.push(`目录项 ${tocButtons} 与正文 heading 锚点 ${h2Anchors} 不一致`);
    }
    if (h2Anchors < 3) failures.push(`正文 heading 少于 3 个，实际 ${h2Anchors}`);
    if (emptyDiagrams > 0) failures.push(`${emptyDiagrams} 个图形块显示空状态而非真实图`);
    if (svgCount + tracePlayers < diagrams) {
      failures.push(`图形块未全部渲染（svg=${svgCount}, trace=${tracePlayers}, cards=${diagrams}）`);
    }
  }

  if (routeDef.kind === 'lab') {
    details.status = dom.texts['.lab-status'];
    details.filename = dom.texts['.lab-file-chip__name'];
    if (!dom.counts['.cm-editor']) failures.push('实验室编辑器未渲染');
    if (!dom.texts['.lab-file-chip__name'].includes('bubble-sort.c')) {
      failures.push(`初始示例文件名异常：${dom.texts['.lab-file-chip__name']}`);
    }
    if (!dom.texts['.lab-status'].includes('尚未分析')) {
      failures.push(`初始状态异常：${dom.texts['.lab-status']}`);
    }
    if (!dom.counts['.lab-panel']) failures.push('分析面板缺失');
    if (!dom.counts['.lab-workspace']) failures.push('实验室工作区缺失');
  }

  if (routeDef.kind === 'map') {
    const svgNodes = dom.counts['.map-node'];
    const mobileItems = dom.counts['.map-mobile-item'];
    details.svgNodes = svgNodes;
    details.mobileItems = mobileItems;
    if (svgNodes !== 28 && mobileItems !== 28) {
      failures.push(`知识图谱概念节点应为 28，实际 svg=${svgNodes}, mobile=${mobileItems}`);
    }
    if (!dom.counts['.map-detail']) failures.push('知识图谱详情卡缺失');
    if (!bodyText.includes('点击任一节点')) failures.push('缺少图谱页说明文案');
  }

  if (routeDef.kind === 'about') {
    const refs = dom.counts['.about-ref'];
    const shortcutRows = dom.counts['.about-keys__table tbody tr'];
    details.refs = refs;
    details.shortcutRows = shortcutRows;
    if (refs !== 2) failures.push(`参考教材卡片应为 2，实际 ${refs}`);
    if (shortcutRows !== 4) failures.push(`快捷键表应为 4 行，实际 ${shortcutRows}`);
    if (!bodyText.includes('原创声明')) failures.push('缺少原创声明');
  }

  if (routeDef.kind === 'notfound') {
    const code = dom.texts['.notfound__code'];
    details.code = code;
    if (code !== '404') failures.push(`404 线框字异常：${code}`);
    if (!bodyText.includes('这段代码没有对应的页面')) failures.push('缺少 404 文案');
  }

  if (routeDef.kind === 'lesson-notfound') {
    if (!bodyText.includes('没有找到这节课')) failures.push('未知课程 id 未显示专门的 404 文案');
  }

  // 占位 / 异常文案
  const allText = dom.bodyTextFull || audit.mainText || '';
  for (const pattern of [/Lorem ipsum/i, /\bTODO\b/, /\bFIXME\b/, /占位文案|占位内容|待补充|待填充/, /\[object Object\]/]) {
    const match = allText.match(pattern);
    if (match) failures.push(`页面出现占位/异常文案「${match[0]}」`);
  }

  // 壳层：桌面侧栏可见、移动顶栏可见
  if (audit.viewport.width >= 960) {
    if (!dom.sidebarVisible) failures.push('桌面视口下侧栏不可见');
    if (dom.mobileTopbarVisible) failures.push('桌面视口下移动顶栏不应可见');
  } else {
    if (dom.sidebarVisible) failures.push('移动视口下桌面侧栏不应可见');
    if (!dom.mobileTopbarVisible) failures.push('移动视口下缺少 sticky 顶栏');
  }

  return { failures, details };
}

async function main() {
  ensureDirs('routes');
  const browser = await launchBrowser();
  const recorder = createRecorder('routes');
  const results = [];
  const combos = [
    {
      id: 'desktop-light',
      label: '桌面 1440×900 浅色',
      viewport: VIEWPORTS.desktop,
      dark: false,
      screenshotAll: true,
    },
    {
      id: 'desktop-dark',
      label: '桌面 1440×900 深色',
      viewport: VIEWPORTS.desktop,
      dark: true,
      screenshotAll: true,
    },
    {
      id: 'mobile-light',
      label: '移动 390×844 浅色',
      viewport: VIEWPORTS.mobile,
      dark: false,
      screenshotAll: true,
    },
    {
      id: 'mobile-dark',
      label: '移动 390×844 深色（跟随系统）',
      viewport: VIEWPORTS.mobile,
      dark: true,
      screenshotAll: false,
      only: ['home', 'lesson-c01-hello', 'lab', 'map'],
    },
  ];

  for (const combo of combos) {
    const { context, page, issues } = await newPage(browser, {
      viewport: combo.viewport,
      // 桌面深色通过点击侧栏按钮切换，因此初始必须为浅色；移动深色跟随系统。
      dark: combo.id === 'mobile-dark',
    });
    let themeClickOk = null;
    // 深色模式：桌面通过点击侧栏「深色模式」按钮切换（验证真实交互）
    if (combo.id === 'desktop-dark') {
      await gotoRoute(page, '#/', { waitMs: 400 });
      const button = page.locator('.sidebar__theme');
      await button.click({ timeout: 5000 });
      themeClickOk =
        (await page.evaluate(() => document.documentElement.dataset.theme)) === 'dark';
      await page.waitForTimeout(250);
    }

    for (const routeDef of ROUTES) {
      if (combo.only && !combo.only.includes(routeDef.name)) continue;
      resetIssues(issues);
      const navIssues = [];
      try {
        await gotoRoute(page, routeDef.route, { waitMs: 450 });
      } catch (error) {
        recorder.fail(`${combo.id}/${routeDef.name}/navigate`, String(error));
        results.push({ combo: combo.id, route: routeDef.name, failures: [`导航失败：${error}`] });
        continue;
      }
      const snapshot = snapshotIssues(issues);
      const audit = await auditLayout(page);
      const dom = await collectDom(page);
      dom.bodyText = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
      dom.bodyTextFull = dom.bodyText;
      const { failures, details } = buildRouteChecks(routeDef, audit, dom, snapshot);

      const theme = await page.evaluate(() => document.documentElement.dataset.theme);
      if (combo.dark && theme !== 'dark') failures.push(`深色模式未生效（data-theme=${theme}）`);
      if (!combo.dark && theme !== 'light') failures.push(`浅色模式异常（data-theme=${theme}）`);

      if (routeDef.title) {
        const actualTitle = await page.title();
        if (actualTitle !== routeDef.title) {
          failures.push(`document.title 应为「${routeDef.title}」，实际「${actualTitle}」`);
        }
      } else if (routeDef.kind === 'lesson') {
        const actualTitle = await page.title();
        if (!actualTitle.includes('· CodeViz') || actualTitle.includes('页面未找到')) {
          failures.push(`课程 document.title 异常：${actualTitle}`);
        }
      }

      // 图谱交互：点击第一个节点，检查详情卡
      if (routeDef.kind === 'map' && combo.viewport.width >= 960) {
        try {
          await page.locator('.map-node').first().click({ timeout: 3000 });
          await page.waitForTimeout(250);
          const detailTitle = await page.evaluate(
            () => document.querySelector('.map-detail__title')?.textContent?.trim() || '',
          );
          details.mapSelected = detailTitle;
          if (!detailTitle) failures.push('点击图谱节点后详情卡未显示概念名');
          await screenshot(page, 'routes', `${combo.id}-map-selected`, { fullPage: false });
        } catch (error) {
          failures.push(`图谱节点点击失败：${error}`);
        }
      }

      // 课程页目录锚点抽查：点击第 2 个目录项，检查滚动与高亮
      if (routeDef.kind === 'lesson' && combo.viewport.width >= 960) {
        const tocCount = dom.counts['.lesson-toc__list button'];
        if (tocCount > 1) {
          const beforeY = await page.evaluate(() => window.scrollY);
          await page.locator('.lesson-toc__list button').nth(1).click({ timeout: 3000 });
          await page.waitForTimeout(900);
          const afterY = await page.evaluate(() => window.scrollY);
          const headingTop = await page.evaluate(() => {
            const heading = document.querySelectorAll('.lesson-blocks h2[id^="lesson-section-"]')[1];
            return heading ? Math.round(heading.getBoundingClientRect().top) : null;
          });
          details.tocScroll = { beforeY, afterY, headingTop };
          if (afterY <= beforeY) failures.push('点击目录项后页面未滚动');
          if (headingTop === null || headingTop < -20 || headingTop > 220) {
            failures.push(`目录跳转后对应 heading 位置异常（top=${headingTop}）`);
          }
          const activeToc = await page.evaluate(
            () => document.querySelector('.lesson-toc__link.is-active')?.textContent?.trim() || '',
          );
          details.activeToc = activeToc;
          if (!activeToc) failures.push('滚动后目录没有高亮当前小节');
          await page.evaluate(() => window.scrollTo(0, 0));
          await page.waitForTimeout(300);
        }
      }

      const shouldScreenshot =
        combo.screenshotAll &&
        (combo.viewport.width >= 960 ||
          !SCREENSHOT_VIEWPORT_ONLY.has(routeDef.lessonId || ''));
      if (shouldScreenshot) {
        const fullPage = combo.id === 'desktop-light' || combo.viewport.width < 960;
        const shot = await screenshot(page, 'routes', `${combo.id}-${routeDef.name}`, {
          fullPage: fullPage && !(combo.id === 'desktop-dark'),
        });
        details.screenshot = shot;
      }

      if (failures.length > 0) {
        for (const failure of failures) recorder.fail(`${combo.id}/${routeDef.name}`, failure);
      } else {
        recorder.add(`${combo.id}/${routeDef.name}`);
      }
      results.push({
        combo: combo.id,
        route: routeDef.route,
        name: routeDef.name,
        failures,
        issues: snapshot,
        warnings: snapshot.consoleWarnings,
        audit: {
          theme,
          viewport: audit.viewport,
          pageScrollWidth: audit.pageScrollWidth,
          pageScrollHeight: audit.pageScrollHeight,
          horizontalScroll: audit.horizontalScroll,
          truncated: audit.truncated,
          scrollContainers: audit.scrollContainers,
          h1: audit.h1,
          mainTextLength: audit.mainTextLength,
        },
        details,
      });
    }

    if (combo.id === 'desktop-dark') {
      recorder.check('desktop-dark/theme-toggle', themeClickOk, '点击侧栏「深色模式」后 data-theme 应为 dark');
    }
    await context.close();
  }

  await browser.close();

  const failedRoutes = results.filter((item) => item.failures.length > 0);
  const payload = {
    base: BASE,
    combos: combos.map((combo) => ({ id: combo.id, label: combo.label })),
    totalChecks: recorder.checks.length,
    failedChecks: recorder.countFailures(),
    failedRoutes: failedRoutes.map((item) => ({
      combo: item.combo,
      route: item.route,
      failures: item.failures,
    })),
    consoleWarnings: [...new Set(results.flatMap((item) => item.warnings || []))],
    results,
  };
  const file = writeResult('routes', payload);
  printSummary('routes', recorder);
  console.log(`结果：${file}`);
  console.log(`失败路由 ${failedRoutes.length} / ${results.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
