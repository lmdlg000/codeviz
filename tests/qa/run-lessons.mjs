/**
 * 课程页验收
 * ------------------------------------------------------------------
 * 抽查 c01-hello / c05-loops / c08-pointers / c11-classes：
 * 目录锚点、测验（选择/判分/解析/重试/持久化）、标记完成与进度持久化、
 * 上一课/下一课、diagram 卡真实渲染与节点点击、内联格式、代码块跳实验室；
 * 移动端课程页与深色模式抽查。
 *
 * 运行：node tests/qa/run-lessons.mjs
 */
import {
  BASE,
  VIEWPORTS,
  auditLayout,
  createRecorder,
  ensureDirs,
  gotoRoute,
  hasIssues,
  launchBrowser,
  newPage,
  printSummary,
  reload,
  resetIssues,
  screenshot,
  snapshotIssues,
  writeResult,
} from './harness.mjs';

const LESSONS = [
  { id: 'c01-hello', chapterIndex: 0, titlePart: '初识 C', kind: 'flow' },
  { id: 'c05-loops', chapterIndex: 1, titlePart: '循环结构', kind: 'flow' },
  { id: 'c08-pointers', chapterIndex: 2, titlePart: '指针', kind: 'memory' },
  { id: 'c11-classes', chapterIndex: 3, titlePart: '类与对象', kind: 'classes' },
];

const AREA = 'lessons';

async function main() {
  ensureDirs(AREA);
  const browser = await launchBrowser();
  const recorder = createRecorder(AREA);
  const phases = [];
  const details = {};

  async function phase(name, fn) {
    resetIssues(globalIssues);
    const started = Date.now();
    try {
      await fn();
    } catch (error) {
      recorder.fail(`${name}/exception`, String(error && error.message ? error.message : error));
    }
    const snapshot = snapshotIssues(globalIssues);
    recorder.check(
      `${name}/console-clean`,
      !hasIssues(snapshot),
      JSON.stringify({
        errors: snapshot.consoleErrors,
        pageErrors: snapshot.pageErrors,
        requestFailures: snapshot.requestFailures,
      }).slice(0, 600),
    );
    phases.push({ name, ms: Date.now() - started, issues: snapshot });
  }

  let globalIssues = [];

  /* ------------------------------------------------------------------ */
  /* 桌面：逐课验收                                                       */
  /* ------------------------------------------------------------------ */
  for (const lesson of LESSONS) {
    const session = await newPage(browser, { viewport: VIEWPORTS.desktop });
    globalIssues = session.issues;
    const page = session.page;
    const lessonDetails = {};
    details[lesson.id] = lessonDetails;

    const lessonPhase = async (suffix, fn) =>
      phase(`${lesson.id}/${suffix}`, async () => {
        await fn();
      });

    // 1. 页面结构与内联格式
    await lessonPhase('structure', async () => {
      await gotoRoute(page, `#/learn/${lesson.id}`, { waitMs: 800 });
      const info = await page.evaluate(() => {
        const text = (selector) =>
          document.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim() || '';
        const count = (selector) => document.querySelectorAll(selector).length;
        return {
          h1: text('.lesson-hero__title'),
          subtitle: text('.lesson-hero__subtitle'),
          objectives: count('.objectives__item'),
          keyPoints: count('.key-points__item'),
          diagrams: count('.diagram-card'),
          codeBlocks: count('.code-block'),
          inlineStrong: count('.md-strong'),
          inlineCode: count('.inline-code'),
          bodyText: document.querySelector('.lesson-article')?.innerText || '',
          textBodies: [...document.querySelectorAll('.text-body')].map((el) => el.innerText),
          title: document.title,
          tocButtons: count('.lesson-toc__list button'),
          h2Anchors: count('.lesson-blocks h2[id^="lesson-section-"]'),
          quiz: count('.quiz__question'),
          pagerPrev: text('.lesson-pager__link--prev'),
          pagerNext: text('.lesson-pager__link--next'),
        };
      });
      lessonDetails.structure = info;
      recorder.check(`${lesson.id}/title`, info.h1.includes(lesson.titlePart), info.h1);
      recorder.check(
        `${lesson.id}/doc-title`,
        info.title.includes('· CodeViz') && !info.title.includes('页面未找到'),
        info.title,
      );
      recorder.check(`${lesson.id}/objectives`, info.objectives >= 3 && info.objectives <= 5, String(info.objectives));
      recorder.check(`${lesson.id}/keypoints`, info.keyPoints >= 3 && info.keyPoints <= 5, String(info.keyPoints));
      recorder.check(`${lesson.id}/diagrams`, info.diagrams >= 2, String(info.diagrams));
      recorder.check(`${lesson.id}/code-blocks`, info.codeBlocks >= 3, String(info.codeBlocks));
      recorder.check(`${lesson.id}/quiz-count`, info.quiz >= 2 && info.quiz <= 4, String(info.quiz));
      recorder.check(`${lesson.id}/toc-matches`, info.tocButtons === info.h2Anchors, `${info.tocButtons} vs ${info.h2Anchors}`);
      recorder.check(
        `${lesson.id}/inline-format`,
        info.inlineStrong > 0 || info.inlineCode > 0,
        `strong=${info.inlineStrong} code=${info.inlineCode}`,
      );
      const literalMarkdown = info.textBodies.filter((body) => body.includes('**') || /`/.test(body));
      recorder.check(
        `${lesson.id}/no-literal-markdown`,
        literalMarkdown.length === 0,
        literalMarkdown.slice(0, 1).join(' ').slice(0, 120),
      );
      recorder.check(`${lesson.id}/pager-next`, info.pagerNext.length > 0, info.pagerNext);
      if (lesson.id !== 'c01-hello') {
        recorder.check(`${lesson.id}/pager-prev`, info.pagerPrev.includes('上一课'), info.pagerPrev);
      }
    });

    // 2. 目录锚点 + 阅读进度
    await lessonPhase('toc', async () => {
      const tocButtons = page.locator('.lesson-toc__list button');
      const tocCount = await tocButtons.count();
      if (tocCount < 2) {
        recorder.fail(`${lesson.id}/toc/exception`, `目录项不足：${tocCount}`);
        return;
      }
      const beforeY = await page.evaluate(() => window.scrollY);
      await tocButtons.nth(1).click();
      await page.waitForTimeout(1000);
      const after = await page.evaluate(() => {
        const heading = document.querySelectorAll('.lesson-blocks h2[id^="lesson-section-"]')[1];
        const fill = document.querySelector('.reading-progress__fill');
        return {
          scrollY: window.scrollY,
          headingTop: heading ? Math.round(heading.getBoundingClientRect().top) : null,
          active: document.querySelector('.lesson-toc__link.is-active')?.textContent?.trim() || '',
          progressWidth: fill ? fill.style.width : '',
        };
      });
      lessonDetails.toc = { beforeY, ...after };
      recorder.check(`${lesson.id}/toc/scrolls`, after.scrollY > beforeY + 100, JSON.stringify(after));
      recorder.check(
        `${lesson.id}/toc/heading-position`,
        after.headingTop !== null && after.headingTop >= -20 && after.headingTop <= 240,
        `headingTop=${after.headingTop}`,
      );
      recorder.check(`${lesson.id}/toc/active-highlight`, Boolean(after.active), after.active);
      recorder.check(
        `${lesson.id}/toc/reading-progress`,
        after.progressWidth && parseFloat(after.progressWidth) > 0,
        after.progressWidth,
      );
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(300);
    });

    // 3. 图形卡：真实渲染 + 节点点击 + 键盘
    await lessonPhase('diagrams', async () => {
      const cards = page.locator('.diagram-card');
      const cardCount = await cards.count();
      const cardInfo = [];
      for (let index = 0; index < cardCount; index += 1) {
        const card = cards.nth(index);
        await card.scrollIntoViewIfNeeded();
        await page.waitForTimeout(350);
        const info = await card.evaluate((element) => ({
          kind: element.querySelector('.diagram-card__kind')?.textContent?.trim() || '',
          svg: Boolean(element.querySelector('.diagram-card__body svg')),
          trace: Boolean(element.querySelector('.diagram-card__body .cvz-trace')),
          empty: Boolean(element.querySelector('.diagram-card__body .cvz-empty')),
          emptyText: element.querySelector('.diagram-card__body .cvz-empty__title')?.textContent?.trim() || '',
          buttons: element.querySelectorAll('.cvz-diagram__body [role="button"][data-line]').length,
          hint: element.querySelector('.diagram-card__hint')?.textContent?.trim() || '',
        }));
        cardInfo.push(info);
        recorder.check(
          `${lesson.id}/diagram-${index}/rendered`,
          (info.svg || info.trace) && !info.empty,
          JSON.stringify(info),
        );
        if (index === 0) {
          await screenshot(page, AREA, `${lesson.id}-diagram-${index}`, { fullPage: false });
        }
        // flow / class 节点点击 → 代码片段
        if (info.buttons > 0) {
          const clickable = card.locator('.cvz-diagram__body [role="button"][data-line]').first();
          const line = await clickable.getAttribute('data-line');
          await clickable.click({ timeout: 4000 });
          await page.waitForTimeout(350);
          const snippet = await card.evaluate((element) => ({
            snippet: Boolean(element.querySelector('.cvz-snippet')),
            line: element.querySelector('.cvz-snippet__line')?.textContent?.trim() || '',
            code: element.querySelector('.cvz-snippet__code')?.textContent?.trim() || '',
          }));
          recorder.check(
            `${lesson.id}/diagram-${index}/node-click`,
            snippet.snippet && /^L\d+$/.test(snippet.line) && snippet.code.length > 0,
            JSON.stringify({ clickedLine: line, ...snippet }),
          );
          // 键盘 Enter 也能触发（聚焦另一个节点）
          const nodes = card.locator('.cvz-diagram__body [role="button"][data-line]');
          if ((await nodes.count()) > 1) {
            const second = nodes.nth(1);
            const secondLine = await second.getAttribute('data-line');
            await second.focus();
            await page.keyboard.press('Enter');
            await page.waitForTimeout(300);
            const lineAfter = await card.evaluate(
              (element) => element.querySelector('.cvz-snippet__line')?.textContent?.trim() || '',
            );
            recorder.check(
              `${lesson.id}/diagram-${index}/node-keyboard`,
              lineAfter === `L${secondLine}`,
              `expected L${secondLine}, got ${lineAfter}`,
            );
          }
        }
        // trace 图卡：播放器应有步骤与控件
        if (info.trace) {
          const traceInfo = await card.evaluate((element) => ({
            counter: element.querySelector('.cvz-trace__counter')?.textContent?.trim() || '',
            play: Boolean(element.querySelector('[aria-label="播放"], [aria-label="暂停"]')),
            next: Boolean(element.querySelector('[aria-label="下一步"]')),
            vars: element.querySelectorAll('.cvz-trace__vars tbody tr').length,
          }));
          recorder.check(
            `${lesson.id}/diagram-${index}/trace-player`,
            traceInfo.play && traceInfo.next && /\d+\s*\/\s*\d+/.test(traceInfo.counter),
            JSON.stringify(traceInfo),
          );
        }
      }
      lessonDetails.diagrams = cardInfo;
    });

    // 4. 测验
    await lessonPhase('quiz', async () => {
      const questions = page.locator('.quiz__question');
      const questionCount = await questions.count();
      for (let index = 0; index < questionCount; index += 1) {
        await questions.nth(index).locator('.quiz__option').first().click();
      }
      await page.waitForTimeout(250);
      const reveal = page.getByRole('button', { name: '查看答案' });
      recorder.check(`${lesson.id}/quiz/reveal-enabled`, await reveal.isEnabled(), '答完后「查看答案」不可用');
      await reveal.click();
      await page.waitForTimeout(450);
      const revealed = await page.evaluate(() => ({
        explains: document.querySelectorAll('.quiz__explain').length,
        correct: document.querySelectorAll('.quiz__option.is-correct').length,
        score: document.querySelector('.quiz__score')?.textContent?.replace(/\s+/g, ' ').trim() || '',
        retry: Boolean(
          [...document.querySelectorAll('.quiz__foot button')].find((el) => el.textContent.includes('再试一次')),
        ),
        stored: (() => {
          try {
            return window.localStorage.getItem('codeviz.quiz.c01-hello');
          } catch {
            return null;
          }
        })(),
      }));
      lessonDetails.quiz = revealed;
      recorder.check(`${lesson.id}/quiz/explain`, revealed.explains === questionCount, JSON.stringify(revealed));
      recorder.check(`${lesson.id}/quiz/correct-marked`, revealed.correct === questionCount, JSON.stringify(revealed));
      recorder.check(`${lesson.id}/quiz/score`, /答对 \d+ \/ \d+ 题/.test(revealed.score), revealed.score);
      recorder.check(`${lesson.id}/quiz/retry-visible`, revealed.retry, '缺少「再试一次」');

      // 刷新后答案/解析持久化
      const quizKey = `codeviz.quiz.${lesson.id}`;
      const beforeReload = await page.evaluate((key) => window.localStorage.getItem(key), quizKey);
      await reload(page, 900);
      const afterReload = await page.evaluate(() => ({
        explains: document.querySelectorAll('.quiz__explain').length,
        score: document.querySelector('.quiz__score')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      }));
      lessonDetails.quizReload = { beforeReload: Boolean(beforeReload), ...afterReload };
      recorder.check(
        `${lesson.id}/quiz/persisted`,
        Boolean(beforeReload) && afterReload.explains === questionCount,
        JSON.stringify(afterReload),
      );

      // 再试一次
      await page.getByRole('button', { name: '再试一次' }).click();
      await page.waitForTimeout(350);
      const retried = await page.evaluate(() => ({
        explains: document.querySelectorAll('.quiz__explain').length,
        hint: document.querySelector('.quiz__hint')?.textContent?.replace(/\s+/g, ' ').trim() || '',
        selected: document.querySelectorAll('.quiz__option.is-selected').length,
        stored: (() => {
          try {
            return window.localStorage.getItem('codeviz.quiz.c01-hello');
          } catch {
            return null;
          }
        })(),
      }));
      lessonDetails.quizRetry = retried;
      recorder.check(`${lesson.id}/quiz/retry-resets`, retried.explains === 0 && retried.selected === 0, JSON.stringify(retried));
      recorder.check(
        `${lesson.id}/quiz/retry-hint`,
        retried.hint.includes('未作答'),
        retried.hint,
      );
    });

    // 5. 标记完成 + 持久化 + 侧栏进度
    await lessonPhase('complete', async () => {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(300);
      const button = page.locator('.lesson-aside__complete .btn');
      const initialText = (await button.innerText()).trim();
      recorder.check(`${lesson.id}/complete/initial`, initialText.includes('标记本节完成'), initialText);
      await button.click();
      await page.waitForTimeout(450);
      const done = await page.evaluate(() => ({
        button: document.querySelector('.lesson-aside__complete .btn')?.textContent?.trim() || '',
        badge: [...document.querySelectorAll('.lesson-hero__badges .badge')].map((el) => el.textContent.trim()),
        stored: (() => {
          try {
            return JSON.parse(window.localStorage.getItem('codeviz.progress.lessons') || '[]');
          } catch {
            return [];
          }
        })(),
        chapterCounts: [...document.querySelectorAll('.chapter-progress__count')].map((el) => el.textContent.trim()),
      }));
      lessonDetails.complete = done;
      recorder.check(`${lesson.id}/complete/button`, done.button.includes('已完成本节'), done.button);
      recorder.check(`${lesson.id}/complete/badge`, done.badge.some((text) => text.includes('已完成')), JSON.stringify(done.badge));
      recorder.check(`${lesson.id}/complete/stored`, done.stored.includes(lesson.id), JSON.stringify(done.stored));
      recorder.check(
        `${lesson.id}/complete/sidebar-count`,
        done.chapterCounts[lesson.chapterIndex]?.startsWith('1/'),
        JSON.stringify(done.chapterCounts),
      );

      await reload(page, 900);
      const persisted = await page.evaluate(() => ({
        button: document.querySelector('.lesson-aside__complete .btn')?.textContent?.trim() || '',
        badge: [...document.querySelectorAll('.lesson-hero__badges .badge')].map((el) => el.textContent.trim()),
      }));
      recorder.check(
        `${lesson.id}/complete/persisted-after-reload`,
        persisted.button.includes('已完成本节') && persisted.badge.some((text) => text.includes('已完成')),
        JSON.stringify(persisted),
      );

      // 取消完成
      await page.locator('.lesson-aside__complete .btn').click();
      await page.waitForTimeout(400);
      const undone = await page.evaluate(() => ({
        button: document.querySelector('.lesson-aside__complete .btn')?.textContent?.trim() || '',
        stored: (() => {
          try {
            return JSON.parse(window.localStorage.getItem('codeviz.progress.lessons') || '[]');
          } catch {
            return [];
          }
        })(),
      }));
      recorder.check(
        `${lesson.id}/complete/toggle-off`,
        undone.button.includes('标记本节完成') && !undone.stored.includes(lesson.id),
        JSON.stringify(undone),
      );
    });

    // 6. 上一课 / 下一课导航
    await lessonPhase('pager', async () => {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(250);
      const nextHref = await page.locator('.lesson-pager__link--next').getAttribute('href');
      await page.locator('.lesson-pager__link--next').click();
      await page.waitForTimeout(900);
      const afterNext = await page.evaluate(() => ({
        hash: window.location.hash,
        title: document.querySelector('.lesson-hero__title')?.textContent?.trim() || '',
      }));
      lessonDetails.pager = { nextHref, ...afterNext };
      recorder.check(
        `${lesson.id}/pager/next-navigates`,
        afterNext.hash !== `#/learn/${lesson.id}` && Boolean(afterNext.title),
        JSON.stringify(lessonDetails.pager),
      );
      if (nextHref && nextHref.startsWith('#')) {
        recorder.check(
          `${lesson.id}/pager/next-href`,
          afterNext.hash === nextHref,
          `href=${nextHref}, hash=${afterNext.hash}`,
        );
      }
    });

    // 7. 代码块「在实验室打开」交接
    await lessonPhase('handoff', async () => {
      await gotoRoute(page, `#/learn/${lesson.id}`, { waitMs: 700 });
      const labButton = page.locator('.code-block__action--lab').first();
      if ((await labButton.count()) === 0) {
        recorder.fail(`${lesson.id}/handoff/exception`, '没有「在实验室打开」按钮');
        return;
      }
      await labButton.scrollIntoViewIfNeeded();
      await labButton.click();
      await page.waitForTimeout(900);
      const lab = await page.evaluate(() => ({
        hash: window.location.hash,
        filename: document.querySelector('.lab-file-chip__name')?.textContent?.trim() || '',
        status: document.querySelector('.lab-status')?.textContent?.trim() || '',
        toasts: [...document.querySelectorAll('.toast__message')].map((el) => el.textContent.trim()),
        code: document.querySelector('.cm-content')?.innerText || '',
      }));
      lessonDetails.handoff = lab;
      recorder.check(`${lesson.id}/handoff/navigates`, lab.hash.startsWith('#/lab'), lab.hash);
      recorder.check(
        `${lesson.id}/handoff/toast`,
        lab.toasts.some((text) => text.includes('已从课程页载入代码')),
        JSON.stringify(lab.toasts),
      );
      recorder.check(`${lesson.id}/handoff/code-loaded`, lab.code.length > 30, `${lab.code.length} 字符`);
      recorder.check(`${lesson.id}/handoff/auto-analyzed`, lab.status.includes('已分析'), lab.status);
    });

    await session.context.close();
  }

  /* ------------------------------------------------------------------ */
  /* 移动端课程页                                                        */
  /* ------------------------------------------------------------------ */
  for (const lesson of [LESSONS[0], LESSONS[3]]) {
    const session = await newPage(browser, { viewport: VIEWPORTS.mobile });
    globalIssues = session.issues;
    const page = session.page;
    const lessonDetails = (details[lesson.id].mobile = {});

    await phase(`${lesson.id}/mobile`, async () => {
      await gotoRoute(page, `#/learn/${lesson.id}`, { waitMs: 800 });
      const layout = await page.evaluate(() => {
        const rect = (selector) => {
          const el = document.querySelector(selector);
          if (!el) return null;
          const r = el.getBoundingClientRect();
          const style = getComputedStyle(el);
          return { width: Math.round(r.width), display: style.display, left: Math.round(r.left), right: Math.round(r.right) };
        };
        return {
          aside: rect('.lesson-aside'),
          mobileToc: rect('.lesson-toc-mobile'),
          topbar: rect('.mobile-topbar'),
          diagram: rect('.diagram-card'),
          quizOption: rect('.quiz__option'),
          scrollWidth: document.documentElement.scrollWidth,
          viewport: window.innerWidth,
          completeMobile: Boolean(document.querySelector('.lesson-complete-mobile .btn')),
        };
      });
      lessonDetails.layout = layout;
      recorder.check(
        `${lesson.id}/mobile/aside-hidden`,
        !layout.aside || layout.aside.display === 'none' || layout.aside.width === 0,
        JSON.stringify(layout),
      );
      recorder.check(`${lesson.id}/mobile/mobile-toc`, Boolean(layout.mobileToc && layout.mobileToc.display !== 'none'), JSON.stringify(layout));
      recorder.check(
        `${lesson.id}/mobile/no-horizontal-scroll`,
        layout.scrollWidth <= layout.viewport + 1,
        JSON.stringify(layout),
      );
      recorder.check(
        `${lesson.id}/mobile/complete-button`,
        layout.completeMobile,
        '移动端缺少标记完成按钮',
      );

      // 折叠目录
      await page.locator('.lesson-toc-mobile__summary').click();
      await page.waitForTimeout(300);
      const tocButtons = page.locator('.lesson-toc-mobile__list button');
      if ((await tocButtons.count()) > 1) {
        await tocButtons.nth(1).click();
        await page.waitForTimeout(900);
        const scrolled = await page.evaluate(() => ({
          scrollY: window.scrollY,
          headingTop: (() => {
            const heading = document.querySelectorAll('.lesson-blocks h2[id^="lesson-section-"]')[1];
            return heading ? Math.round(heading.getBoundingClientRect().top) : null;
          })(),
        }));
        lessonDetails.mobileToc = scrolled;
        recorder.check(
          `${lesson.id}/mobile/toc-scroll`,
          scrolled.scrollY > 100 && scrolled.headingTop !== null && scrolled.headingTop <= 240,
          JSON.stringify(scrolled),
        );
      } else {
        recorder.fail(`${lesson.id}/mobile/toc-items`, '移动端目录没有条目');
      }

      // 图形卡截图
      await page.locator('.diagram-card').first().scrollIntoViewIfNeeded();
      await page.waitForTimeout(450);
      await screenshot(page, AREA, `${lesson.id}-mobile-diagram`, { fullPage: false });

      // 测验可点
      await page.locator('.quiz__question').first().scrollIntoViewIfNeeded();
      await page.waitForTimeout(350);
      await page.locator('.quiz__question').first().locator('.quiz__option').first().click();
      await page.waitForTimeout(250);
      const quizMobile = await page.evaluate(() => {
        const option = document.querySelector('.quiz__option')?.getBoundingClientRect();
        return {
          selected: document.querySelectorAll('.quiz__option.is-selected').length,
          optionWidth: option ? Math.round(option.width) : 0,
          viewport: window.innerWidth,
        };
      });
      lessonDetails.quizMobile = quizMobile;
      recorder.check(
        `${lesson.id}/mobile/quiz-clickable`,
        quizMobile.selected === 1 && quizMobile.optionWidth <= quizMobile.viewport,
        JSON.stringify(quizMobile),
      );

      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(300);
      await screenshot(page, AREA, `${lesson.id}-mobile-top`, { fullPage: false });
    });
    await session.context.close();
  }

  /* ------------------------------------------------------------------ */
  /* 深色模式课程页                                                      */
  /* ------------------------------------------------------------------ */
  {
    const session = await newPage(browser, { viewport: VIEWPORTS.desktop });
    globalIssues = session.issues;
    const page = session.page;
    await phase('dark/lesson-c01', async () => {
      await gotoRoute(page, '#/learn/c01-hello', { waitMs: 700 });
      await page.locator('.sidebar__theme').click();
      await page.waitForTimeout(400);
      const theme = await page.evaluate(() => document.documentElement.dataset.theme);
      recorder.check('dark/theme-applied', theme === 'dark', theme);
      const readability = await page.evaluate(() => {
        const pick = (selector) => {
          const el = document.querySelector(selector);
          if (!el) return null;
          const style = getComputedStyle(el);
          return { color: style.color, background: style.backgroundColor, fontSize: style.fontSize };
        };
        return {
          body: pick('body'),
          text: pick('.text-body'),
          codeBlock: pick('.code-block'),
          diagram: pick('.diagram-card'),
          quizOption: pick('.quiz__option'),
        };
      });
      details.dark = readability;
      recorder.check('dark/body-color', readability.body?.color === 'rgb(229, 234, 243)', JSON.stringify(readability.body));
      await screenshot(page, AREA, 'c01-dark-desktop', { fullPage: false });
      await page.locator('.diagram-card').first().scrollIntoViewIfNeeded();
      await page.waitForTimeout(400);
      await screenshot(page, AREA, 'c01-dark-diagram', { fullPage: false });
      const audit = await auditLayout(page);
      recorder.check('dark/no-horizontal-scroll', !audit.horizontalScroll, `${audit.pageScrollWidth}`);
      recorder.check('dark/no-overflow', audit.offenders.length === 0, JSON.stringify(audit.offenders.slice(0, 2)));
    });
    await session.context.close();
  }

  await browser.close();

  const failed = recorder.checks.filter((entry) => !entry.ok);
  writeResult(AREA, {
    base: BASE,
    phases,
    details,
    checks: recorder.checks,
    failedChecks: failed,
  });
  printSummary('lessons', recorder);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
