/**
 * 代码实验室深度流程验收
 * ------------------------------------------------------------------
 * 覆盖：分析代码 → 7 个 tab → 流程图节点联动 → 单步执行播放器 →
 * 示例库（搜索/筛选/载入 C++ 类示例）→ 上传（合法 / 超 500 行 / 非法扩展名 / 空文件）→
 * Ctrl+Enter / Ctrl+Shift+Enter → 草稿刷新恢复 → 语法错误诊断 → 空代码 → 移动端堆叠。
 *
 * 运行：node tests/qa/run-lab.mjs
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
  reload,
  resetIssues,
  screenshot,
  snapshotIssues,
  toastMessages,
  waitForToast,
  writeResult,
} from './harness.mjs';

const AREA = 'lab';

const VALID_SMALL_C = `#include <stdio.h>

int main(void) {
  printf("upload ok\\n");
  return 0;
}
`;

const MISSING_SEMICOLON = `#include <stdio.h>

int main(void) {
  int x = 1
  printf("%d\\n", x);
  return 0;
}
`;

const SCANF_NO_AMPER = `#include <stdio.h>

int main(void) {
  int x = 0;
  scanf("%d", x);
  printf("%d\\n", x);
  return 0;
}
`;

const ARRAY_OUT_OF_BOUNDS = `#include <stdio.h>

int main(void) {
  int a[3] = {1, 2, 3};
  a[5] = 9;
  printf("%d\\n", a[5]);
  return 0;
}
`;

const DIVISION_BY_ZERO = `#include <stdio.h>

int main(void) {
  int y = 10 / 0;
  printf("%d\\n", y);
  return 0;
}
`;

const UNSUPPORTED_TRACE = `#include <stdio.h>

int main(void) {
  FILE *fp = fopen("data.txt", "r");
  if (fp == NULL) {
    return 1;
  }
  fclose(fp);
  return 0;
}
`;

function buildRecorder() {
  return createRecorder(AREA);
}

async function main() {
  ensureDirs(AREA);
  const browser = await launchBrowser();
  const recorder = buildRecorder();
  const phases = [];
  const details = {};
  const { context, page, issues } = await newPage(browser, {
    viewport: VIEWPORTS.desktop,
  });

  const shot = (name, fullPage = false) => screenshot(page, AREA, name, { fullPage });

  async function phase(name, fn) {
    resetIssues(issues);
    const started = Date.now();
    try {
      await fn();
    } catch (error) {
      recorder.fail(`${name}/exception`, String(error && error.message ? error.message : error));
    }
    const snapshot = snapshotIssues(issues);
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

  const tab = (label) => page.getByRole('tab', { name: label });
  const readCounter = () =>
    page.evaluate(() => {
      const el = document.querySelector('.cvz-trace__counter');
      return el ? el.textContent.trim() : '';
    });
  const parseCounter = (text) => {
    const match = /(\d+)\s*\/\s*(\d+)/.exec(text || '');
    return match ? { step: Number(match[1]), total: Number(match[2]) } : null;
  };
  const statusText = () =>
    page.evaluate(() => document.querySelector('.lab-status')?.textContent?.trim() || '');
  const waitAnalyzed = async () => {
    await page.waitForTimeout(250);
    await page.waitForFunction(
      () => {
        const text = document.querySelector('.lab-status')?.textContent || '';
        return text.includes('已分析') && !text.includes('正在分析');
      },
      null,
      { timeout: 12000 },
    );
    await page.waitForTimeout(250);
  };
  const setEditorCode = async (code) => {
    await page.locator('.cm-content').click();
    await page.keyboard.press('Control+A');
    await page.keyboard.insertText(code);
    await page.waitForTimeout(350);
  };
  const readEditor = () => page.locator('.cm-content').innerText();
  const readDiagnostics = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('.cvz-diag__message')].map((el) => el.textContent.trim()),
    );
  const dialog = () => page.getByRole('dialog', { name: '示例库' });

  /* ------------------------------------------------------------------ */
  /* 1. 初始状态                                                         */
  /* ------------------------------------------------------------------ */
  await phase('initial', async () => {
    await gotoRoute(page, '#/lab', { waitMs: 900 });
    const info = await page.evaluate(() => ({
      filename: document.querySelector('.lab-file-chip__name')?.textContent?.trim() || '',
      status: document.querySelector('.lab-status')?.textContent?.trim() || '',
      lines: document.querySelector('.lab-file-chip__lines')?.textContent?.trim() || '',
      emptyPanel: Boolean(document.querySelector('.lab-panel-empty')),
      tabs: document.querySelectorAll('[role="tab"]').length,
      editorText: document.querySelector('.cm-content')?.innerText || '',
    }));
    details.initial = info;
    recorder.check('initial/filename', info.filename.includes('bubble-sort.c'), info.filename);
    recorder.check('initial/status', info.status.includes('尚未分析'), info.status);
    recorder.check('initial/empty-panel', info.emptyPanel, `tabs=${info.tabs}`);
    recorder.check('initial/no-tabs', info.tabs === 0, `tabs=${info.tabs}`);
    recorder.check('initial/editor-has-code', info.editorText.length > 40, `${info.editorText.length} 字符`);
    recorder.check('initial/lines-chip', /^\d+\s*\/\s*500\s*行$/.test(info.lines), info.lines);
    await shot('lab-initial');
  });

  /* ------------------------------------------------------------------ */
  /* 2. 点击「分析代码」                                                  */
  /* ------------------------------------------------------------------ */
  await phase('analyze', async () => {
    await page.getByRole('button', { name: '分析代码' }).click();
    await waitAnalyzed();
    const info = await page.evaluate(() => ({
      status: document.querySelector('.lab-status')?.textContent?.trim() || '',
      tabs: [...document.querySelectorAll('[role="tab"]')].map((el) => el.textContent.trim()),
      stats: [...document.querySelectorAll('.stat-tile')].map((tile) => ({
        label: tile.querySelector('.stat-tile__label')?.textContent?.trim(),
        value: tile.querySelector('.stat-tile__value')?.textContent?.trim(),
        hint: tile.querySelector('.stat-tile__hint')?.textContent?.trim(),
      })),
      functions: [...document.querySelectorAll('.lab-function__name')].map((el) =>
        el.textContent.trim(),
      ),
      complexity: document.querySelector('.lab-metrics dd')?.textContent?.trim(),
      external: [...document.querySelectorAll('.lab-code-chip')].map((el) => el.textContent.trim()),
    }));
    details.analysis = info;
    recorder.check('analyze/status', /已分析 · \d+ 个函数 · \d+ 个错误/.test(info.status), info.status);
    recorder.check('analyze/seven-tabs', info.tabs.length === 7, JSON.stringify(info.tabs));
    recorder.check(
      'analyze/four-stat-tiles',
      info.stats.length === 4,
      JSON.stringify(info.stats),
    );
    const funcTile = info.stats.find((tile) => tile.label === '函数');
    recorder.check(
      'analyze/function-count-matches-list',
      funcTile && Number(funcTile.value) === info.functions.length,
      `tile=${funcTile?.value} list=${info.functions.length}`,
    );
    recorder.check('analyze/functions-found', info.functions.length >= 1, JSON.stringify(info.functions));
    recorder.check(
      'analyze/external-calls',
      info.external.includes('printf'),
      JSON.stringify(info.external),
    );
    await shot('lab-overview');
  });

  /* ------------------------------------------------------------------ */
  /* 3. 依次访问 7 个 tab，并验证流程图节点联动                          */
  /* ------------------------------------------------------------------ */
  await phase('tabs', async () => {
    // 概览
    await tab('概览').click();
    await page.waitForTimeout(250);
    const overviewVisible = await page.locator('.lab-stat-grid').isVisible();
    recorder.check('tabs/overview', overviewVisible, '概览统计卡不可见');

    // 流程图
    await tab('流程图').click();
    await page.waitForTimeout(450);
    const flowInfo = await page.evaluate(() => ({
      nodes: document.querySelectorAll('.cvz-flow__node').length,
      chips: document.querySelectorAll('.lab-fn-chip').length,
      svg: Boolean(document.querySelector('.cvz-flow svg')),
      legend: document.querySelector('.cvz-flow')?.textContent?.includes('判断') || false,
    }));
    details.flow = flowInfo;
    recorder.check('tabs/flow-nodes', flowInfo.nodes > 0, JSON.stringify(flowInfo));
    recorder.check('tabs/flow-svg', flowInfo.svg, '缺少流程图 SVG');
    recorder.check('tabs/flow-function-chips', flowInfo.chips > 0, JSON.stringify(flowInfo));
    await shot('lab-flow');

    // 流程图：点击节点 → 编辑器对应行高亮 + 代码片段
    const nodeLines = await page.evaluate(() =>
      [...document.querySelectorAll('.cvz-flow__node[data-line]')]
        .map((el) => Number(el.getAttribute('data-line')))
        .filter((line) => line > 0),
    );
    if (nodeLines.length === 0) {
      recorder.fail('flow/node-click', '流程图中没有带行号的节点');
    } else {
      const targetLine = nodeLines[Math.floor(nodeLines.length / 2)];
      await page.locator(`.cvz-flow__node[data-line="${targetLine}"]`).first().click({ timeout: 4000 });
      await page.waitForTimeout(500);
      const linked = await page.evaluate(() => ({
        snippetLine: document.querySelector('.lab-code-snippet__line')?.textContent?.trim() || '',
        snippetText: document.querySelector('.lab-code-snippet__text')?.textContent?.trim() || '',
        highlighted: document.querySelectorAll('.cm-line.cm-cv-target-line').length,
        activeNodes: document.querySelectorAll('.cvz-flow__node.is-active').length,
        scrollerTop: document.querySelector('.lab-editor-card .cm-scroller')?.scrollTop ?? -1,
      }));
      details.flowLink = { targetLine, ...linked };
      recorder.check(
        'flow/node-click-snippet',
        linked.snippetLine === `L${targetLine}`,
        `期望 L${targetLine}，实际 ${linked.snippetLine}`,
      );
      recorder.check('flow/node-click-highlight', linked.highlighted === 1, JSON.stringify(linked));
      recorder.check('flow/node-click-active', linked.activeNodes >= 1, JSON.stringify(linked));
      recorder.check('flow/node-click-editor-scroll', linked.scrollerTop >= 0, JSON.stringify(linked));
    }

    // 调用图
    await tab('调用图').click();
    await page.waitForTimeout(450);
    const callInfo = await page.evaluate(() => ({
      nodes: document.querySelectorAll('.cvz-call__node').length,
      external: [...document.querySelectorAll('.cvz-call__external .cvz-call__chip, .cvz-call__chips span')].map(
        (el) => el.textContent.trim(),
      ),
      legend: (document.querySelector('.cvz-call')?.textContent || '').includes('递归'),
    }));
    details.calls = callInfo;
    recorder.check('tabs/calls-nodes', callInfo.nodes > 0, JSON.stringify(callInfo));
    await shot('lab-calls');
    if (callInfo.nodes > 0) {
      await page.locator('.cvz-call__node').first().click({ timeout: 4000 });
      await page.waitForTimeout(500);
      const callDetail = await page.evaluate(() => ({
        detail: Boolean(document.querySelector('.lab-detail-card__name')),
        name: document.querySelector('.lab-detail-card__name')?.textContent?.trim() || '',
        locate: Boolean(
          [...document.querySelectorAll('.lab-detail-card button')].find((el) =>
            el.textContent.includes('在编辑器中定位'),
          ),
        ),
        highlighted: document.querySelectorAll('.cm-line.cm-cv-target-line').length,
      }));
      details.callDetail = callDetail;
      recorder.check('calls/node-click-detail', callDetail.detail, JSON.stringify(callDetail));
      recorder.check('calls/node-click-highlight', callDetail.highlighted >= 1, JSON.stringify(callDetail));
    }

    // 类图（C 示例应显示空状态）
    await tab('类图').click();
    await page.waitForTimeout(350);
    const classEmpty = await page.evaluate(() => ({
      empty: Boolean(document.querySelector('.empty-state')),
      emptyText: document.querySelector('.empty-state__title')?.textContent?.trim() || '',
      nodes: document.querySelectorAll('.cvz-class__node').length,
    }));
    details.classesEmpty = classEmpty;
    recorder.check(
      'tabs/classes-empty-state',
      classEmpty.nodes === 0 && classEmpty.emptyText.includes('还没有定义 class'),
      JSON.stringify(classEmpty),
    );
    await shot('lab-classes-empty');

    // 内存
    await tab('内存').click();
    await page.waitForTimeout(400);
    const memoryInfo = await page.evaluate(() => ({
      frames: document.querySelectorAll('.cvz-memory__frame').length,
      cells: document.querySelectorAll('.cvz-memory__cell').length,
      sections: [...document.querySelectorAll('.cvz-memory__section-title, .cvz-memory__section-label')].map(
        (el) => el.textContent.trim(),
      ),
      note: document.querySelector('.lab-inline-note--memory')?.textContent?.trim() || '',
      svg: Boolean(document.querySelector('.cvz-memory svg')),
    }));
    details.memory = memoryInfo;
    recorder.check('tabs/memory-rendered', memoryInfo.svg && memoryInfo.frames > 0, JSON.stringify(memoryInfo));
    recorder.check('tabs/memory-note', /教学示意|不是运行期真实地址|不是程序真实运行时的地址/.test(memoryInfo.note), memoryInfo.note);
    await shot('lab-memory');

    // 诊断
    await tab('诊断').click();
    await page.waitForTimeout(350);
    const diagInfo = await page.evaluate(() => ({
      summary: document.querySelector('.lab-diagnostics__summary')?.textContent?.trim() || '',
      items: document.querySelectorAll('.cvz-diag__item').length,
      empty: document.querySelector('.lab-panel .empty-state__title')?.textContent?.trim() || '',
    }));
    details.diagnostics = diagInfo;
    recorder.check(
      'tabs/diagnostics-rendered',
      Boolean(diagInfo.summary) || Boolean(diagInfo.empty),
      JSON.stringify(diagInfo),
    );
  });

  /* ------------------------------------------------------------------ */
  /* 4. 单步执行播放器                                                    */
  /* ------------------------------------------------------------------ */
  await phase('trace', async () => {
    await tab('单步执行').click();
    await page.waitForTimeout(350);
    const intro = await page.evaluate(() => ({
      intro: Boolean(document.querySelector('.lab-trace-intro')),
      support: document.querySelector('.lab-trace-support')?.textContent?.trim() || '',
    }));
    recorder.check('trace/intro', intro.intro, JSON.stringify(intro));
    recorder.check('trace/support-hint', intro.support.length > 0, JSON.stringify(intro));

    await page.getByRole('button', { name: '运行追踪' }).click();
    await page.waitForFunction(() => Boolean(document.querySelector('.cvz-trace')), null, {
      timeout: 12000,
    });
    await page.waitForTimeout(400);

    const counter1 = parseCounter(await readCounter());
    const state = await page.evaluate(() => ({
      description: document.querySelector('.cvz-trace__desc')?.textContent?.trim() || '',
      vars: [...document.querySelectorAll('.cvz-trace__vars tbody tr')].map((el) =>
        el.textContent.replace(/\s+/g, ' ').trim(),
      ),
      chips: document.querySelectorAll('.cvz-trace__chips .cvz-chip').length,
      output: document.querySelector('.cvz-trace__console')?.textContent || '',
      activeLine: document.querySelector('.cvz-trace__line.is-active .cvz-trace__gutter')?.textContent || '',
    }));
    details.traceStart = { counter1, ...state };
    recorder.check('trace/counter', counter1 && counter1.total > 5, JSON.stringify(counter1));
    recorder.check('trace/description', state.description.length > 0, state.description);
    recorder.check('trace/active-line', Boolean(state.activeLine), JSON.stringify(state));
    await shot('lab-trace');

    // 下一步 / 上一步
    await page.getByRole('button', { name: '下一步' }).click();
    await page.waitForTimeout(250);
    const counter2 = parseCounter(await readCounter());
    await page.getByRole('button', { name: '上一步' }).click();
    await page.waitForTimeout(250);
    const counter3 = parseCounter(await readCounter());
    recorder.check(
      'trace/next-step',
      counter2 && counter1 && counter2.step === Math.min(counter1.step + 1, counter1.total),
      `${JSON.stringify(counter1)} → ${JSON.stringify(counter2)}`,
    );
    recorder.check(
      'trace/prev-step',
      counter3 && counter1 && counter3.step === Math.min(counter2.step - 1, counter2.total),
      `${JSON.stringify(counter2)} → ${JSON.stringify(counter3)}`,
    );

    // 播放 / 暂停
    const playButton = page.getByRole('button', { name: '播放' });
    await playButton.click();
    await page.waitForTimeout(1400);
    const duringPlay = parseCounter(await readCounter());
    const pauseVisible = await page.getByRole('button', { name: '暂停' }).isVisible();
    await page.getByRole('button', { name: '暂停' }).click();
    await page.waitForTimeout(300);
    const paused1 = parseCounter(await readCounter());
    await page.waitForTimeout(900);
    const paused2 = parseCounter(await readCounter());
    recorder.check('trace/play-advances', duringPlay && duringPlay.step > counter3.step, `${JSON.stringify(counter3)} → ${JSON.stringify(duringPlay)}`);
    recorder.check('trace/pause-button-visible', pauseVisible, '播放中未显示暂停按钮');
    recorder.check('trace/pause-holds', paused1 && paused2 && paused1.step === paused2.step, `${JSON.stringify(paused1)} → ${JSON.stringify(paused2)}`);

    // 速度
    await page.getByRole('button', { name: '2×' }).click();
    await page.waitForTimeout(150);
    const speed2 = await page.getByRole('button', { name: '2×' }).getAttribute('aria-pressed');
    await page.getByRole('button', { name: '0.5×' }).click();
    await page.waitForTimeout(150);
    const speedHalf = await page.getByRole('button', { name: '0.5×' }).getAttribute('aria-pressed');
    recorder.check('trace/speed-controls', speed2 === 'true' && speedHalf === 'true', `2x=${speed2}, 0.5x=${speedHalf}`);

    // 跳到末一步：变量与输出应随步变化
    await page.getByRole('button', { name: '跳到末一步' }).click();
    await page.waitForTimeout(400);
    const endState = await page.evaluate(() => ({
      counter: document.querySelector('.cvz-trace__counter')?.textContent?.trim() || '',
      vars: [...document.querySelectorAll('.cvz-trace__vars tbody tr')].map((el) =>
        el.textContent.replace(/\s+/g, ' ').trim(),
      ),
      output: document.querySelector('.cvz-trace__console')?.textContent || '',
      changed: document.querySelectorAll('.cvz-trace__vars tr.is-changed').length,
    }));
    details.traceEnd = endState;
    recorder.check(
      'trace/output-changes',
      endState.output.trim().length > 0 && !endState.output.includes('（程序还没有输出）'),
      endState.output.slice(0, 80),
    );
    recorder.check(
      'trace/vars-change',
      JSON.stringify(state.vars) !== JSON.stringify(endState.vars) || state.vars.length === 0,
      `start=${JSON.stringify(state.vars)} end=${JSON.stringify(endState.vars)}`,
    );

    // 键盘：空格播放/暂停
    await page.locator('.cvz-trace').focus();
    await page.keyboard.press('Space');
    await page.waitForTimeout(250);
    const keyboardPlaying = await page.evaluate(
      () => document.querySelector('.cvz-iconbtn--primary')?.getAttribute('aria-label') || '',
    );
    await page.keyboard.press('Space');
    await page.waitForTimeout(200);
    const keyboardPaused = await page.evaluate(
      () => document.querySelector('.cvz-iconbtn--primary')?.getAttribute('aria-label') || '',
    );
    recorder.check(
      'trace/space-toggle',
      keyboardPlaying === '暂停' || keyboardPaused === '播放',
      `${keyboardPlaying} / ${keyboardPaused}`,
    );

    // 滑块跳转
    const sliderResult = await page.evaluate(() => {
      const slider = document.querySelector('.cvz-trace__slider');
      if (!slider) return null;
      const target = Math.floor(Number(slider.max) / 2);
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(slider, String(target));
      slider.dispatchEvent(new Event('input', { bubbles: true }));
      slider.dispatchEvent(new Event('change', { bubbles: true }));
      return target;
    });
    await page.waitForTimeout(450);
    const sliderCounter = parseCounter(await readCounter());
    recorder.check(
      'trace/slider',
      sliderResult !== null && sliderCounter && sliderCounter.step - 1 === sliderResult,
      `slider=${sliderResult}, counter=${JSON.stringify(sliderCounter)}`,
    );
  });

  /* ------------------------------------------------------------------ */
  /* 5. 示例库：搜索 / 筛选 / 载入 C++ 类示例                            */
  /* ------------------------------------------------------------------ */
  await phase('sample-library', async () => {
    await page.getByRole('button', { name: '示例库' }).click();
    await dialog().waitFor({ timeout: 5000 });
    await page.waitForTimeout(350);
    const modal = await page.evaluate(() => ({
      title: document.querySelector('#codeviz-modal-title')?.textContent?.trim() || '',
      cards: document.querySelectorAll('.sample-card').length,
      tags: document.querySelectorAll('.sample-picker__tags button').length,
      focusedInside: Boolean(document.querySelector('.sample-modal')?.contains(document.activeElement)),
    }));
    details.sampleModal = modal;
    recorder.check('library/modal-open', modal.title === '示例库', modal.title);
    recorder.check('library/cards', modal.cards >= 10, `cards=${modal.cards}`);
    recorder.check('library/tags', modal.tags > 3, `tags=${modal.tags}`);
    // 打开后焦点应自动进入搜索框
    const focusSearch = await page.evaluate(
      () => document.activeElement?.getAttribute('aria-label') || document.activeElement?.tagName || '',
    );
    recorder.check('library/focus-search', focusSearch === '搜索示例', focusSearch);

    // 搜索
    await page.getByRole('searchbox', { name: '搜索示例' }).fill('Rectangle');
    await page.waitForTimeout(350);
    const searchCount = await page.locator('.sample-card').count();
    recorder.check('library/search-filters', searchCount >= 1 && searchCount < modal.cards, `搜索「Rectangle」后 ${searchCount} 条`);
    await page.getByRole('searchbox', { name: '搜索示例' }).fill('');
    await page.waitForTimeout(250);

    // 语言筛选
    await page.getByRole('button', { name: 'C++', exact: true }).click();
    await page.waitForTimeout(300);
    const cppOnly = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('.sample-card')];
      return {
        count: cards.length,
        allCpp: cards.every((card) => card.textContent.includes('C++')),
      };
    });
    recorder.check('library/language-filter', cppOnly.count > 0 && cppOnly.allCpp, JSON.stringify(cppOnly));
    await shot('lab-sample-library');

    // 载入 class-rectangle
    await page.getByRole('searchbox', { name: '搜索示例' }).fill('Rectangle');
    await page.waitForTimeout(350);
    await page.locator('.sample-card').first().click();
    await page.waitForTimeout(400);
    const dialogGone = (await dialog().count()) === 0;
    await waitAnalyzed();
    const loaded = await page.evaluate(() => ({
      filename: document.querySelector('.lab-file-chip__name')?.textContent?.trim() || '',
      status: document.querySelector('.lab-status')?.textContent?.trim() || '',
      code: document.querySelector('.cm-content')?.innerText || '',
      toast: [...document.querySelectorAll('.toast__message')].map((el) => el.textContent.trim()),
    }));
    details.classSampleLoaded = loaded;
    recorder.check('library/modal-closes', dialogGone, '载入示例后弹窗未关闭');
    recorder.check('library/class-filename', loaded.filename === 'class-rectangle.cpp', loaded.filename);
    recorder.check('library/class-code', loaded.code.includes('class Rectangle'), '编辑器未载入 Rectangle 代码');

    // 类图
    await tab('类图').click();
    await page.waitForTimeout(500);
    const classInfo = await page.evaluate(() => ({
      nodes: document.querySelectorAll('.cvz-class__node').length,
      names: [...document.querySelectorAll('.cvz-class__name')].map((el) => el.textContent.trim()),
      fields: [...document.querySelectorAll('.cvz-class__member')].map((el) => el.textContent.trim()),
      rows: document.querySelectorAll('.cvz-class__row').length,
      svg: Boolean(document.querySelector('.cvz-class svg')),
    }));
    details.classDiagram = classInfo;
    recorder.check('library/class-diagram-nodes', classInfo.nodes >= 1, JSON.stringify(classInfo));
    recorder.check(
      'library/class-diagram-name',
      classInfo.names.includes('Rectangle'),
      JSON.stringify(classInfo.names),
    );
    recorder.check(
      'library/class-diagram-members',
      classInfo.fields.some((text) => text.includes('width_')) &&
        classInfo.fields.some((text) => text.includes('area')),
      JSON.stringify(classInfo.fields.slice(0, 6)),
    );
    await shot('lab-class-diagram');
    // 点击成员行定位代码
    if (classInfo.rows > 0) {
      await page.locator('.cvz-class__row.is-clickable').first().click({ timeout: 4000 });
      await page.waitForTimeout(400);
      const memberLink = await page.evaluate(() => ({
        highlighted: document.querySelectorAll('.cm-line.cm-cv-target-line').length,
        activeRows: document.querySelectorAll('.cvz-class__row.is-active').length,
      }));
      recorder.check(
        'library/class-member-link',
        memberLink.highlighted >= 1,
        JSON.stringify(memberLink),
      );
    }

    // 载入 shape-polymorphism，验证继承
    await page.getByRole('button', { name: '示例库' }).click();
    await dialog().waitFor({ timeout: 5000 });
    await page.getByRole('searchbox', { name: '搜索示例' }).fill('Shape');
    await page.waitForTimeout(350);
    await page.locator('.sample-card').first().click();
    await page.waitForTimeout(300);
    await waitAnalyzed();
    await tab('类图').click();
    await page.waitForTimeout(500);
    const poly = await page.evaluate(() => ({
      nodes: document.querySelectorAll('.cvz-class__node').length,
      names: [...document.querySelectorAll('.cvz-class__name')].map((el) => el.textContent.trim()),
      inheritEdges: document.querySelectorAll('.cvz-class__inherit').length,
      virtualBadges: document.querySelectorAll('.cvz-class__virtual-badge').length,
      bases: [...document.querySelectorAll('.cvz-class__bases')].map((el) => el.textContent.trim()),
      legend: (document.querySelector('.cvz-class__legend')?.textContent || '').trim(),
    }));
    details.polymorphism = poly;
    recorder.check('library/poly-classes', poly.nodes === 3, JSON.stringify(poly.names));
    recorder.check(
      'library/poly-names',
      ['Shape', 'Circle', 'Rectangle'].every((name) => poly.names.includes(name)),
      JSON.stringify(poly.names),
    );
    recorder.check('library/poly-inheritance', poly.inheritEdges >= 2, `inherit edges=${poly.inheritEdges}`);
    recorder.check('library/poly-virtual', poly.virtualBadges >= 1, `virtual badges=${poly.virtualBadges}`);
    recorder.check('library/poly-legend', poly.legend.includes('继承'), poly.legend);
    await shot('lab-polymorphism-classes');

    // 调用图应包含成员函数与外部函数
    await tab('调用图').click();
    await page.waitForTimeout(400);
    const polyCalls = await page.evaluate(() => ({
      nodes: [...document.querySelectorAll('.cvz-call__name')].map((el) => el.textContent.trim()),
      external: [...document.querySelectorAll('.cvz-call__chips span')].map((el) => el.textContent.trim()),
    }));
    details.polyCalls = polyCalls;
    recorder.check('library/poly-calls', polyCalls.nodes.length >= 3, JSON.stringify(polyCalls.nodes));
    await shot('lab-polymorphism-calls');

    // 内存视图有数据（不是空状态）
    await tab('内存').click();
    await page.waitForTimeout(400);
    const polyMemory = await page.evaluate(() => ({
      frames: document.querySelectorAll('.cvz-memory__frame').length,
      cells: document.querySelectorAll('.cvz-memory__cell').length,
      empty: document.querySelector('.lab-memory .cvz-empty__title')?.textContent?.trim() || '',
    }));
    recorder.check('library/poly-memory', polyMemory.frames > 0 && polyMemory.cells > 0, JSON.stringify(polyMemory));
  });

  /* ------------------------------------------------------------------ */
  /* 6. 上传：合法 / 超 500 行 / 非法扩展名 / 空文件                      */
  /* ------------------------------------------------------------------ */
  await phase('upload', async () => {
    // 合法 ≤500 行
    await page.locator('input.lab-file-input').setInputFiles({
      name: 'small.c',
      mimeType: 'text/x-c',
      buffer: Buffer.from(VALID_SMALL_C, 'utf8'),
    });
    const okToast = await waitForToast(page, /已载入 small\.c/);
    recorder.check('upload/valid-toast', Boolean(okToast), `toast=${okToast}`);
    await waitAnalyzed();
    const uploaded = await page.evaluate(() => ({
      filename: document.querySelector('.lab-file-chip__name')?.textContent?.trim() || '',
      code: document.querySelector('.cm-content')?.innerText || '',
      status: document.querySelector('.lab-status')?.textContent?.trim() || '',
      lines: document.querySelector('.lab-file-chip__lines')?.textContent?.trim() || '',
    }));
    details.uploadValid = uploaded;
    recorder.check('upload/valid-filename', uploaded.filename === 'small.c', uploaded.filename);
    recorder.check('upload/valid-code', uploaded.code.includes('upload ok'), '编辑器未载入 small.c');
    recorder.check('upload/valid-auto-analyze', uploaded.status.includes('已分析'), uploaded.status);
    recorder.check('upload/valid-lines', /^\d+\s*\/\s*500\s*行$/.test(uploaded.lines), uploaded.lines);

    // 超过 500 行
    const bigLines = Array.from({ length: 501 }, (_, index) => `// line ${index + 1}`).join('\n');
    await page.locator('input.lab-file-input').setInputFiles({
      name: 'big.c',
      mimeType: 'text/x-c',
      buffer: Buffer.from(bigLines, 'utf8'),
    });
    const bigToast = await waitForToast(page, /超过了 500 行的上限/);
    const afterBig = await page.evaluate(() => ({
      filename: document.querySelector('.lab-file-chip__name')?.textContent?.trim() || '',
      code: document.querySelector('.cm-content')?.innerText || '',
    }));
    details.uploadBig = { toast: bigToast, ...afterBig };
    recorder.check('upload/too-large-toast', Boolean(bigToast), `toast=${bigToast}`);
    recorder.check(
      'upload/too-large-rejected',
      afterBig.filename === 'small.c' && !afterBig.code.includes('// line 501'),
      JSON.stringify(afterBig.filename),
    );

    // 非法扩展名
    await page.locator('input.lab-file-input').setInputFiles({
      name: 'evil.py',
      mimeType: 'text/x-python',
      buffer: Buffer.from('print("hello")\n', 'utf8'),
    });
    const typeToast = await waitForToast(page, /只支持 \.c \/ \.cpp/);
    const afterPy = await page.evaluate(
      () => document.querySelector('.lab-file-chip__name')?.textContent?.trim() || '',
    );
    details.uploadWrongType = { toast: typeToast, filename: afterPy };
    recorder.check('upload/wrong-type-toast', Boolean(typeToast), `toast=${typeToast}`);
    recorder.check('upload/wrong-type-rejected', afterPy === 'small.c', afterPy);

    // 空文件
    await page.locator('input.lab-file-input').setInputFiles({
      name: 'empty.c',
      mimeType: 'text/x-c',
      buffer: Buffer.from('   \n\n  \n', 'utf8'),
    });
    const emptyToast = await waitForToast(page, /文件是空的/);
    recorder.check('upload/empty-toast', Boolean(emptyToast), `toast=${emptyToast}`);
  });

  /* ------------------------------------------------------------------ */
  /* 7. 快捷键 / 草稿 / 状态                                              */
  /* ------------------------------------------------------------------ */
  await phase('shortcuts-draft', async () => {
    // 修改代码 → stale 状态
    await page.locator('.cm-content').click();
    await page.keyboard.press('Control+End');
    await page.keyboard.insertText('\n// QA-EDIT-MARKER');
    await page.waitForTimeout(400);
    const stale = await statusText();
    recorder.check('shortcut/stale-status', stale.includes('代码已修改'), stale);

    // Ctrl+Enter 重新分析
    await page.keyboard.press('Control+Enter');
    await waitAnalyzed();
    const afterShortcut = await statusText();
    recorder.check('shortcut/ctrl-enter-analyze', afterShortcut.includes('已分析'), afterShortcut);

    // Ctrl+Shift+Enter 运行追踪
    await page.keyboard.press('Control+Shift+Enter');
    await page.waitForFunction(
      () => {
        const selected = document.querySelector('[role="tab"][aria-selected="true"]');
        return selected?.textContent?.includes('单步执行') && Boolean(document.querySelector('.cvz-trace'));
      },
      null,
      { timeout: 12000 },
    );
    const traceTabOk = await page.evaluate(() => {
      const selected = document.querySelector('[role="tab"][aria-selected="true"]');
      return {
        tab: selected?.textContent?.trim() || '',
        player: Boolean(document.querySelector('.cvz-trace')),
      };
    });
    recorder.check(
      'shortcut/ctrl-shift-enter-trace',
      traceTabOk.tab.includes('单步执行'),
      JSON.stringify(traceTabOk),
    );

    // 草稿持久化：等待防抖写入后刷新
    await page.locator('.cm-content').click();
    await page.keyboard.press('Control+End');
    await page.keyboard.insertText('\n// QA-DRAFT-MARKER');
    await page.waitForTimeout(1200);
    const draftStored = await page.evaluate(() => {
      try {
        const raw = window.localStorage.getItem('codeviz.lab.draft');
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null;
      }
    });
    details.draftStored = draftStored
      ? { filename: draftStored.filename, marker: String(draftStored.code).includes('QA-DRAFT-MARKER') }
      : null;
    await reload(page, 1000);
    const restored = await page.evaluate(() => ({
      filename: document.querySelector('.lab-file-chip__name')?.textContent?.trim() || '',
      code: document.querySelector('.cm-content')?.innerText || '',
      status: document.querySelector('.lab-status')?.textContent?.trim() || '',
    }));
    details.draftRestored = restored;
    recorder.check(
      'draft/persisted-to-storage',
      Boolean(details.draftStored && details.draftStored.marker),
      JSON.stringify(details.draftStored),
    );
    recorder.check(
      'draft/restored-after-reload',
      restored.code.includes('QA-DRAFT-MARKER') && restored.filename === 'small.c',
      `${restored.filename} / marker=${restored.code.includes('QA-DRAFT-MARKER')}`,
    );
    recorder.check('draft/no-auto-analyze', restored.status.includes('尚未分析'), restored.status);
  });

  /* ------------------------------------------------------------------ */
  /* 8. 语法错误诊断 / 空代码 / 不支持追踪                                */
  /* ------------------------------------------------------------------ */
  await phase('diagnostics', async () => {
    const cases = [
      {
        id: 'missing-semicolon',
        code: MISSING_SEMICOLON,
        expected: /分号/,
        name: '缺少分号',
      },
      {
        id: 'scanf-no-amper',
        code: SCANF_NO_AMPER,
        expected: /scanf.*(&|取地址)|(&|取地址).*scanf/i,
        name: 'scanf 缺少 &',
      },
      {
        id: 'array-out-of-bounds',
        code: ARRAY_OUT_OF_BOUNDS,
        expected: /越界|超出范围/,
        name: '数组越界',
      },
      {
        id: 'division-by-zero',
        code: DIVISION_BY_ZERO,
        expected: /除.*0|0.*除/,
        name: '除数为 0',
      },
    ];
    const found = {};
    for (const item of cases) {
      await setEditorCode(item.code);
      await page.keyboard.press('Control+Enter');
      await page.waitForTimeout(300);
      await waitAnalyzed();
      await tab('诊断').click();
      await page.waitForTimeout(350);
      const messages = await readDiagnostics();
      found[item.id] = messages;
      recorder.check(
        `diagnostics/${item.id}`,
        messages.some((message) => item.expected.test(message)),
        `${item.name}：${JSON.stringify(messages.slice(0, 5))}`,
      );
      // 页面仍然存活
      const alive = await page.locator('.lab-panel').isVisible();
      recorder.check(`diagnostics/${item.id}/no-crash`, alive, '诊断后分析面板消失');
    }
    details.diagnosticsFound = found;
    await shot('lab-diagnostics-errors');

    // 有错误代码的诊断 tab 徽标与概览统计
    await tab('概览').click();
    await page.waitForTimeout(300);
    const errorStats = await page.evaluate(() => ({
      status: document.querySelector('.lab-status')?.textContent?.trim() || '',
      diagTile: [...document.querySelectorAll('.stat-tile')].find((tile) =>
        tile.textContent.includes('诊断'),
      )?.textContent?.trim(),
    }));
    details.errorStats = errorStats;
    recorder.check('diagnostics/status-error-count', /个错误/.test(errorStats.status), errorStats.status);

    // 空代码
    await setEditorCode('');
    await page.waitForTimeout(400);
    const empty = await page.evaluate(() => ({
      lines: document.querySelector('.lab-file-chip__lines')?.textContent?.trim() || '',
      analyzeDisabled:
        document.querySelector('.lab-toolbar__actions .btn--primary')?.disabled ?? null,
      traceDisabled:
        document.querySelector('.lab-toolbar__actions .btn--secondary')?.disabled ?? null,
    }));
    details.emptyCode = empty;
    recorder.check('empty/lines', /^0\s*\/\s*500/.test(empty.lines), empty.lines);
    recorder.check('empty/analyze-disabled', empty.analyzeDisabled === true, JSON.stringify(empty));
    recorder.check('empty/trace-disabled', empty.traceDisabled === true, JSON.stringify(empty));
    await page.locator('.cm-content').click();
    await page.keyboard.press('Control+Enter');
    const emptyToast = await waitForToast(page, /请先输入或载入/);
    recorder.check('empty/analyze-toast', Boolean(emptyToast), `toast=${emptyToast}`);
    await shot('lab-empty-code');

    // 不支持的追踪（文件 I/O）
    await setEditorCode(UNSUPPORTED_TRACE);
    await page.getByRole('button', { name: '执行追踪' }).click();
    await page.waitForTimeout(1200);
    const unsupported = await page.evaluate(() => ({
      error: Boolean(document.querySelector('.lab-trace-error')),
      kind: document.querySelector('.lab-trace-error__kind')?.textContent?.trim() || '',
      message: document.querySelector('.lab-trace-error__message')?.textContent?.trim() || '',
      suggestion: document.querySelector('.lab-trace-error__suggestion')?.textContent?.trim() || '',
    }));
    details.unsupportedTrace = unsupported;
    recorder.check('trace/unsupported-friendly', unsupported.error, JSON.stringify(unsupported));
    recorder.check(
      'trace/unsupported-chinese',
      /[\u4e00-\u9fa5]/.test(unsupported.message),
      unsupported.message,
    );
    await shot('lab-trace-unsupported');
  });

  /* ------------------------------------------------------------------ */
  /* 9. URL query 自动载入示例                                            */
  /* ------------------------------------------------------------------ */
  await phase('url-query', async () => {
    await gotoRoute(page, '#/lab?sample=factorial', { waitMs: 900 });
    await page.waitForTimeout(300);
    const info = await page.evaluate(() => ({
      filename: document.querySelector('.lab-file-chip__name')?.textContent?.trim() || '',
      status: document.querySelector('.lab-status')?.textContent?.trim() || '',
      code: document.querySelector('.cm-content')?.innerText || '',
      tabs: document.querySelectorAll('[role="tab"]').length,
    }));
    details.urlSample = info;
    recorder.check('query/sample-filename', info.filename === 'factorial.c', info.filename);
    recorder.check('query/sample-auto-analyzed', info.status.includes('已分析') && info.tabs === 7, info.status);
    recorder.check('query/sample-code', info.code.includes('factorial'), '未载入 factorial 代码');
  });

  /* ------------------------------------------------------------------ */
  /* 10. 移动端（390×844）：堆叠、抽屉、深色、播放器                       */
  /* ------------------------------------------------------------------ */
  let mobileContext = null;
  await phase('mobile', async () => {
    const mobile = await newPage(browser, { viewport: VIEWPORTS.mobile });
    mobileContext = mobile.context;
    const mpage = mobile.page;
    const missues = mobile.issues;
    try {
      await gotoRoute(mpage, '#/lab', { waitMs: 900 });
      const layout = await mpage.evaluate(() => {
        const editor = document.querySelector('.lab-editor-card')?.getBoundingClientRect();
        const panel = document.querySelector('.lab-panel')?.getBoundingClientRect();
        return {
          viewport: window.innerWidth,
          editor: editor ? { top: Math.round(editor.top), bottom: Math.round(editor.bottom) } : null,
          panel: panel ? { top: Math.round(panel.top), bottom: Math.round(panel.bottom) } : null,
          scrollWidth: document.documentElement.scrollWidth,
          topbar: Boolean(document.querySelector('.mobile-topbar')),
          sidebarVisible: (() => {
            const el = document.querySelector('.sidebar');
            if (!el) return false;
            return getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 50;
          })(),
        };
      });
      details.mobileLayout = layout;
      recorder.check(
        'mobile/stacked',
        layout.panel && layout.editor && layout.panel.top >= layout.editor.bottom - 2,
        JSON.stringify(layout),
      );
      recorder.check('mobile/no-horizontal-scroll', layout.scrollWidth <= layout.viewport + 1, JSON.stringify(layout));
      recorder.check('mobile/sidebar-hidden', !layout.sidebarVisible, JSON.stringify(layout));
      await screenshot(mpage, AREA, 'lab-mobile-initial', { fullPage: true });

      // 抽屉
      await mpage.getByRole('button', { name: '打开导航菜单' }).click();
      await mpage.waitForTimeout(400);
      const drawer = await mpage.evaluate(() => ({
        open: Boolean(document.querySelector('.drawer')),
        focused: Boolean(document.querySelector('.drawer')?.contains(document.activeElement)),
        themeButton: Boolean(document.querySelector('.drawer .sidebar__theme')),
      }));
      recorder.check('mobile/drawer-opens', drawer.open, JSON.stringify(drawer));
      recorder.check('mobile/drawer-focus', drawer.focused, JSON.stringify(drawer));
      await screenshot(mpage, AREA, 'lab-mobile-drawer');
      await mpage.keyboard.press('Escape');
      await mpage.waitForTimeout(350);
      recorder.check(
        'mobile/drawer-escape-closes',
        (await mpage.locator('.drawer').count()) === 0,
        'Esc 未关闭抽屉',
      );

      // 分析 + tab 横向滚动 + 播放器
      await mpage.getByRole('button', { name: '分析代码' }).click();
      await mpage.waitForTimeout(300);
      await mpage.waitForFunction(
        () => {
          const text = document.querySelector('.lab-status')?.textContent || '';
          return text.includes('已分析');
        },
        null,
        { timeout: 12000 },
      );
      await mpage.waitForTimeout(300);
      await mpage.getByRole('tab', { name: '单步执行' }).click();
      await mpage.waitForTimeout(400);
      await mpage.getByRole('button', { name: '运行追踪' }).click();
      await mpage.waitForFunction(() => Boolean(document.querySelector('.cvz-trace')), null, {
        timeout: 12000,
      });
      await mpage.waitForTimeout(400);
      const mobileTrace = await mpage.evaluate(() => {
        const player = document.querySelector('.cvz-trace')?.getBoundingClientRect();
        const tabs = document.querySelector('.lab-panel__tabs')?.getBoundingClientRect();
        return {
          player: player ? { left: Math.round(player.left), right: Math.round(player.right), width: Math.round(player.width) } : null,
          tabs: tabs ? { left: Math.round(tabs.left), right: Math.round(tabs.right) } : null,
          counter: document.querySelector('.cvz-trace__counter')?.textContent?.trim() || '',
          scrollWidth: document.documentElement.scrollWidth,
          viewport: window.innerWidth,
        };
      });
      details.mobileTrace = mobileTrace;
      recorder.check('mobile/trace-player', Boolean(mobileTrace.player && mobileTrace.player.width > 200), JSON.stringify(mobileTrace));
      recorder.check('mobile/no-overflow-after-trace', mobileTrace.scrollWidth <= mobileTrace.viewport + 1, JSON.stringify(mobileTrace));
      await screenshot(mpage, AREA, 'lab-mobile-trace', { fullPage: true });

      // 移动端深色（抽屉内按钮）
      await mpage.getByRole('button', { name: '打开导航菜单' }).click();
      await mpage.waitForTimeout(350);
      await mpage.locator('.drawer .sidebar__theme').click();
      await mpage.waitForTimeout(350);
      const theme = await mpage.evaluate(() => document.documentElement.dataset.theme);
      recorder.check('mobile/dark-toggle', theme === 'dark', `data-theme=${theme}`);
      await mpage.keyboard.press('Escape');
      await mpage.waitForTimeout(300);
      await screenshot(mpage, AREA, 'lab-mobile-dark', { fullPage: true });
    } finally {
      const snapshot = snapshotIssues(missues);
      recorder.check(
        'mobile/console-clean',
        !hasIssues(snapshot),
        JSON.stringify({
          errors: snapshot.consoleErrors,
          pageErrors: snapshot.pageErrors,
          failures: snapshot.requestFailures,
        }).slice(0, 500),
      );
      phases.push({ name: 'mobile', issues: snapshot });
    }
  });

  await context.close();
  if (mobileContext) await mobileContext.close();
  await browser.close();

  const payload = {
    base: BASE,
    phases,
    details,
    checks: recorder.checks,
    failedChecks: recorder.checks.filter((entry) => !entry.ok),
  };
  const file = writeResult(AREA, payload);
  printSummary('lab', recorder);
  console.log(`结果：${file}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
