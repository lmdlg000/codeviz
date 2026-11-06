/**
 * 数据 / 内容完整性检查
 * ------------------------------------------------------------------
 * 1) 静态文本检查：13 个课程文件与契约映射、样例文件、占位文案、HTML/外链注入面；
 * 2) 通过 Vite dev server 在浏览器里动态 import 真实数据模块，
 *    校验 lesson/quiz/sample/concept 的结构、字数、图形代码能否被引擎分析。
 *
 * 运行：node tests/qa/check-content.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  ROOT,
  BASE,
  createRecorder,
  ensureDirs,
  gotoRoute,
  launchBrowser,
  newPage,
  printSummary,
  writeResult,
} from './harness.mjs';

const AREA = 'content';

const EXPECTED_LESSONS = [
  ['01-hello.ts', 'c01-hello', 'c-basics', 1, 'hello-world'],
  ['02-data.ts', 'c02-data', 'c-basics', 2, 'circle-area'],
  ['03-operators.ts', 'c03-operators', 'c-basics', 3, 'temp-convert'],
  ['04-selection.ts', 'c04-selection', 'c-control', 1, 'grade-level'],
  ['05-loops.ts', 'c05-loops', 'c-control', 2, 'sum-1-to-100'],
  ['06-arrays.ts', 'c06-arrays', 'c-data', 1, 'bubble-sort'],
  ['07-functions.ts', 'c07-functions', 'c-data', 2, 'factorial'],
  ['08-pointers.ts', 'c08-pointers', 'c-data', 3, 'swap-pointer'],
  ['09-structs.ts', 'c09-structs', 'c-data', 4, 'student-struct'],
  ['10-files.ts', 'c10-files', 'c-data', 5, 'score-file'],
  ['11-classes.ts', 'c11-classes', 'cpp-oop', 1, 'class-rectangle'],
  ['12-inheritance.ts', 'c12-inheritance', 'cpp-oop', 2, 'shape-polymorphism'],
  ['13-templates.ts', 'c13-templates', 'cpp-oop', 3, 'stl-vector'],
];

const REQUIRED_SAMPLE_IDS = [
  'hello-world', 'circle-area', 'temp-convert', 'grade-level', 'sum-1-to-100',
  'bubble-sort', 'factorial', 'swap-pointer', 'student-struct', 'score-file',
  'class-rectangle', 'shape-polymorphism', 'stl-vector',
];

const PLACEHOLDER = /Lorem ipsum|\bTODO\b|\bFIXME\b|\bTBD\b|待补充|待填充|占位文案|占位内容/;
const MARKDOWN_LINK = /\]\((https?:|\/|#)/;

function chineseCount(text) {
  return (String(text).match(/[\u4e00-\u9fa5]/g) || []).length;
}

async function main() {
  ensureDirs();
  const recorder = createRecorder(AREA);
  const details = {};

  /* --------------------------- 静态文件检查 --------------------------- */
  const dataDir = path.join(ROOT, 'src', 'data');
  const lessonDir = path.join(dataDir, 'lessons');
  const actualFiles = fs.readdirSync(lessonDir).filter((name) => name.endsWith('.ts')).sort();
  const expectedFiles = EXPECTED_LESSONS.map((item) => item[0]);
  recorder.check(
    'files/lesson-count',
    actualFiles.length === expectedFiles.length,
    `${actualFiles.length} 个课程文件：${actualFiles.join(', ')}`,
  );
  for (const name of expectedFiles) {
    recorder.check(`files/lesson-exists-${name}`, actualFiles.includes(name), '缺少课程文件');
  }
  details.files = actualFiles;

  const lessonSources = {};
  for (const [fileName, id, chapterId, order, labSampleId] of EXPECTED_LESSONS) {
    const file = path.join(lessonDir, fileName);
    if (!fs.existsSync(file)) continue;
    const source = fs.readFileSync(file, 'utf8');
    lessonSources[id] = source;
    const idMatch = /id:\s*'([^']+)'/.exec(source);
    const chapterMatch = /chapterId:\s*'([^']+)'/.exec(source);
    const orderMatch = /order:\s*(\d+)/.exec(source);
    const sampleMatch = /labSampleId:\s*'([^']+)'/.exec(source);
    recorder.check(`file/${id}/id`, idMatch?.[1] === id, `id=${idMatch?.[1]}`);
    recorder.check(`file/${id}/chapter`, chapterMatch?.[1] === chapterId, chapterMatch?.[1]);
    recorder.check(`file/${id}/order`, orderMatch?.[1] === String(order), orderMatch?.[1]);
    recorder.check(`file/${id}/labSampleId`, sampleMatch?.[1] === labSampleId, sampleMatch?.[1]);
    const placeholder = PLACEHOLDER.exec(source);
    recorder.check(`file/${id}/no-placeholder`, !placeholder, placeholder?.[0]);
    const mdLink = MARKDOWN_LINK.exec(source);
    recorder.check(`file/${id}/no-markdown-link`, !mdLink, mdLink?.[0]);
  }

  // 样例文件 id
  const sampleDir = path.join(dataDir, 'samples');
  const sampleIds = [];
  for (const name of fs.readdirSync(sampleDir).filter((item) => item.endsWith('.ts'))) {
    const source = fs.readFileSync(path.join(sampleDir, name), 'utf8');
    for (const match of source.matchAll(/^\s*id:\s*'([^']+)'/gm)) sampleIds.push(match[1]);
  }
  details.staticSampleIds = sampleIds;
  recorder.check('files/sample-count', sampleIds.length >= 13, `${sampleIds.length} 个样例`);
  for (const id of REQUIRED_SAMPLE_IDS) {
    recorder.check(`files/sample-required-${id}`, sampleIds.includes(id), '缺少契约要求的样例 id');
  }

  // 源码注入面
  const uiFiles = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(tsx?|css)$/.test(entry.name)) uiFiles.push(full);
    }
  };
  walk(path.join(ROOT, 'src'));
  const dangerous = uiFiles.filter((file) => fs.readFileSync(file, 'utf8').includes('dangerouslySetInnerHTML'));
  recorder.check('security/no-dangerouslySetInnerHTML', dangerous.length === 0, dangerous.join(', '));
  const dataFiles = [];
  const walkData = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walkData(full);
      else if (entry.name.endsWith('.ts')) dataFiles.push(full);
    }
  };
  walkData(dataDir);
  const externalUrls = [];
  for (const file of dataFiles) {
    const source = fs.readFileSync(file, 'utf8');
    for (const match of source.matchAll(/https?:\/\/[^\s'"`)]+/g)) externalUrls.push(`${path.basename(file)}: ${match[0]}`);
  }
  recorder.check('security/no-external-urls-in-data', externalUrls.length === 0, externalUrls.slice(0, 3).join(' | '));
  details.dangerous = dangerous;
  details.externalUrls = externalUrls;

  // 仓库根目录遗留临时文件
  const leftovers = ['temp-viz-test.log'];
  for (const name of leftovers) {
    recorder.check(`cleanup/no-${name}`, !fs.existsSync(path.join(ROOT, name)), `根目录遗留 ${name}`);
  }
  const smokePath = path.join(ROOT, 'src/ui/viz/__tests__/smoke.test.ts');
  if (fs.existsSync(smokePath)) {
    const source = fs.readFileSync(smokePath, 'utf8');
    recorder.check(
      'cleanup/no-temp-smoke-test',
      !/临时冒烟测试|验证后删除|不随仓库交付/.test(source),
      'src/ui/viz/__tests__/smoke.test.ts 标注为临时测试但仍在仓库',
    );
  }

  /* ------------------------ 浏览器动态 import 检查 ------------------------ */
  const { context, page } = await newPage(browserRef, { viewport: { width: 1440, height: 900 } });
  try {
    await gotoRoute(page, '#/about', { waitMs: 500 });
    const data = await page.evaluate(async () => {
      const [{ lessons, samples, chapters, conceptGraph, glossary }, engine] = await Promise.all([
        import('/src/data/index.ts'),
        import('/src/engine/index.ts'),
      ]);
      const analyzeSummary = (code, filename) => {
        const result = engine.analyzeCode(code, filename ? { filename } : {});
        return {
          ok: result.ok,
          functions: result.functions.length,
          flowcharts: result.flowcharts.length,
          callNodes: result.callGraph.nodes.length,
          classes: result.classes.map((item) => ({ name: item.name, bases: item.bases, fields: item.fields.length, methods: item.methods.length })),
          memoryCells: result.memory.globals.length + result.memory.stack.reduce((sum, frame) => sum + frame.cells.length, 0) + result.memory.heap.length,
          diagnostics: result.diagnostics.length,
        };
      };
      const simulateSummary = (code) => {
        const trace = engine.simulate(code);
        return { ok: trace.ok, supported: trace.supported, steps: trace.steps.length, error: trace.error?.message ?? null };
      };
      return {
        lessons: lessons.map((lesson) => ({
          id: lesson.id,
          chapterId: lesson.chapterId,
          order: lesson.order,
          title: lesson.title,
          subtitle: lesson.subtitle,
          description: lesson.description,
          difficulty: lesson.difficulty,
          minutes: lesson.minutes,
          objectives: lesson.objectives.length,
          keyPoints: lesson.keyPoints.length,
          quiz: lesson.quiz.map((question) => ({
            id: question.id,
            options: question.options.length,
            answer: question.answer,
            question: question.question,
            explanation: question.explanation,
          })),
          labSampleId: lesson.labSampleId ?? null,
          blocks: lesson.blocks.map((block) => {
            if (block.type === 'text') return { type: 'text', body: block.body };
            if (block.type === 'heading') return { type: 'heading', text: block.text };
            if (block.type === 'list') return { type: 'list', items: block.items };
            if (block.type === 'note') return { type: 'note', body: block.body, title: block.title };
            if (block.type === 'code') {
              return {
                type: 'code',
                code: block.code,
                lines: block.code.split(/\r?\n/).length,
                runnable: block.runnable !== false,
              };
            }
            if (block.type === 'diagram') {
              const filename = /c1[123]-/.test(lesson.id) ? 'snippet.cpp' : 'snippet.c';
              return {
                type: 'diagram',
                kind: block.diagram.kind,
                analysis: analyzeSummary(block.diagram.code, filename),
                trace: block.diagram.kind === 'trace' ? simulateSummary(block.diagram.code) : null,
              };
            }
            if (block.type === 'try') return { type: 'try', code: block.code, prompt: block.prompt };
            if (block.type === 'compare') return { type: 'compare', left: block.left.code, right: block.right.code };
            if (block.type === 'table') return { type: 'table', rows: block.rows.length };
            if (block.type === 'steps') return { type: 'steps', items: block.items };
            return { type: block.type };
          }),
        })),
        samples: samples.map((sample) => ({
          id: sample.id,
          title: sample.title,
          description: sample.description,
          language: sample.language,
          tags: sample.tags,
          level: sample.level,
          focus: sample.focus,
          lines: sample.code.split(/\r?\n/).length,
          analysis: analyzeSummary(sample.code, `${sample.id}.${sample.language === 'cpp' ? 'cpp' : 'c'}`),
        })),
        chapters,
        conceptNodes: conceptGraph.nodes,
        conceptEdges: conceptGraph.edges,
        glossaryCount: glossary.length,
      };
    });
    details.data = {
      lessonCount: data.lessons.length,
      sampleCount: data.samples.length,
      chapterCount: data.chapters.length,
      conceptCount: data.conceptNodes.length,
      edgeCount: data.conceptEdges.length,
      glossary: data.glossaryCount,
    };

    /* 课程结构 */
    const ids = data.lessons.map((lesson) => lesson.id);
    recorder.check('data/lesson-count', data.lessons.length === 13, String(data.lessons.length));
    recorder.check('data/lesson-ids-unique', new Set(ids).size === ids.length, ids.join(','));
    recorder.check('data/chapter-count', data.chapters.length === 4, String(data.chapters.length));
    const chapterIds = new Set(data.chapters.map((chapter) => chapter.id));
    const orderBuckets = new Map();
    for (const lesson of data.lessons) {
      recorder.check(`data/${lesson.id}/chapter-valid`, chapterIds.has(lesson.chapterId), lesson.chapterId);
      recorder.check(`data/${lesson.id}/title`, lesson.title.trim().length > 0, lesson.title);
      recorder.check(`data/${lesson.id}/minutes`, lesson.minutes > 0, String(lesson.minutes));
      recorder.check(`data/${lesson.id}/objectives-range`, lesson.objectives >= 3 && lesson.objectives <= 5, String(lesson.objectives));
      recorder.check(`data/${lesson.id}/keypoints-range`, lesson.keyPoints >= 3 && lesson.keyPoints <= 5, String(lesson.keyPoints));
      if (!orderBuckets.has(lesson.chapterId)) orderBuckets.set(lesson.chapterId, []);
      orderBuckets.get(lesson.chapterId).push(lesson.order);
    }
    for (const [chapterId, orders] of orderBuckets) {
      orders.sort((a, b) => a - b);
      const valid = orders.every((value, index) => value === index + 1);
      recorder.check(`data/${chapterId}/order-sequence`, valid, orders.join(','));
    }

    /* quiz */
    const quizIds = new Set();
    let quizTotal = 0;
    for (const lesson of data.lessons) {
      recorder.check(`data/${lesson.id}/quiz-count`, lesson.quiz.length >= 2 && lesson.quiz.length <= 4, String(lesson.quiz.length));
      for (const question of lesson.quiz) {
        quizTotal += 1;
        if (quizIds.has(question.id)) recorder.fail(`data/${lesson.id}/quiz-id-unique`, question.id);
        quizIds.add(question.id);
        recorder.check(
          `data/${question.id}/quiz-valid`,
          question.options === 4 &&
            question.answer >= 0 &&
            question.answer < 4 &&
            question.question.trim().length > 0 &&
            question.explanation.trim().length > 0,
          JSON.stringify(question).slice(0, 200),
        );
      }
    }
    recorder.check('data/quiz-ids-unique', quizIds.size === quizTotal, `${quizIds.size}/${quizTotal}`);

    /* 样例 */
    const sampleIds = data.samples.map((sample) => sample.id);
    recorder.check('data/sample-ids-unique', new Set(sampleIds).size === sampleIds.length, sampleIds.join(','));
    for (const id of REQUIRED_SAMPLE_IDS) {
      recorder.check(`data/sample-required-${id}`, sampleIds.includes(id), '缺少契约样例');
    }
    for (const sample of data.samples) {
      recorder.check(
        `data/sample-${sample.id}/valid`,
        sample.title.trim().length > 0 &&
          sample.description.trim().length > 0 &&
          sample.tags.length >= 2 &&
          sample.tags.length <= 4 &&
          sample.level >= 1 &&
          sample.level <= 3 &&
          sample.lines <= 500,
        JSON.stringify({ tags: sample.tags, level: sample.level, lines: sample.lines }),
      );
      recorder.check(
        `data/sample-${sample.id}/analyzable`,
        sample.analysis.ok && sample.analysis.functions > 0,
        JSON.stringify(sample.analysis).slice(0, 200),
      );
    }

    /* lesson → sample 引用 */
    for (const lesson of data.lessons) {
      recorder.check(
        `data/${lesson.id}/labSample-exists`,
        !lesson.labSampleId || sampleIds.includes(lesson.labSampleId),
        lesson.labSampleId || '(none)',
      );
    }

    /* 正文块 / 字数 / 图形代码 */
    const diagramFailures = [];
    const wordCounts = {};
    for (const lesson of data.lessons) {
      let chinese = 0;
      let codeBlocks = 0;
      let diagramBlocks = 0;
      let notes = 0;
      let tries = 0;
      for (const block of lesson.blocks) {
        if (block.type === 'text') chinese += (block.body.match(/[\u4e00-\u9fa5]/g) || []).length;
        if (block.type === 'note') chinese += (block.body.match(/[\u4e00-\u9fa5]/g) || []).length;
        if (block.type === 'list') chinese += block.items.join('').match(/[\u4e00-\u9fa5]/g)?.length || 0;
        if (block.type === 'note') notes += 1;
        if (block.type === 'try') tries += 1;
        if (block.type === 'code') {
          codeBlocks += 1;
          if (block.lines > 500) recorder.fail(`data/${lesson.id}/code-limit`, `${block.lines} 行`);
        }
        if (block.type === 'diagram') {
          diagramBlocks += 1;
          const analysis = block.analysis;
          if (block.kind === 'flow' && analysis.flowcharts === 0) {
            diagramFailures.push(`${lesson.id}/flow: 无流程图`);
          }
          if (block.kind === 'calls' && analysis.callNodes === 0) {
            diagramFailures.push(`${lesson.id}/calls: 无调用节点`);
          }
          if (block.kind === 'classes' && analysis.classes.length === 0) {
            diagramFailures.push(`${lesson.id}/classes: 无类`);
          }
          if (block.kind === 'memory' && analysis.memoryCells === 0) {
            diagramFailures.push(`${lesson.id}/memory: 无内存单元`);
          }
          if (block.kind === 'trace') {
            const trace = block.trace;
            if (!trace || !trace.ok || !trace.supported || trace.steps === 0) {
              diagramFailures.push(`${lesson.id}/trace: ${trace?.error || '无执行步骤'}`);
            }
          }
        }
      }
      wordCounts[lesson.id] = chinese;
      recorder.check(`data/${lesson.id}/code-blocks`, codeBlocks >= 3, String(codeBlocks));
      recorder.check(`data/${lesson.id}/diagrams`, diagramBlocks >= 2, String(diagramBlocks));
      recorder.check(`data/${lesson.id}/note`, notes >= 1, String(notes));
      recorder.check(`data/${lesson.id}/try`, tries >= 1, String(tries));
      recorder.check(
        `data/${lesson.id}/word-count`,
        chinese >= 1000 && chinese <= 2400,
        `text/note/list 汉字 ${chinese}（契约约 1200–2200）`,
      );
    }
    details.wordCounts = wordCounts;
    recorder.check('data/diagram-code-analyzable', diagramFailures.length === 0, diagramFailures.slice(0, 6).join(' | '));
    details.diagramFailures = diagramFailures;

    /* 概念图 */
    const nodeIds = new Set(data.conceptNodes.map((node) => node.id));
    recorder.check('data/concepts-count', data.conceptNodes.length === 28, String(data.conceptNodes.length));
    const conceptProblems = [];
    let invalidEdges = 0;
    for (const edge of data.conceptEdges) {
      if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) invalidEdges += 1;
    }
    recorder.check('data/concept-edges-valid', invalidEdges === 0, `${invalidEdges} 条悬空边`);
    for (const node of data.conceptNodes) {
      if (!chapterIds.has(node.chapterId)) conceptProblems.push(`${node.id}: chapter`);
      if (node.lessonId && !ids.includes(node.lessonId)) conceptProblems.push(`${node.id}: lesson`);
      if (!Number.isInteger(node.tier) || node.tier < 0) conceptProblems.push(`${node.id}: tier`);
    }
    recorder.check('data/concept-nodes-valid', conceptProblems.length === 0, conceptProblems.join(', '));
    const labels = data.conceptNodes.map((node) => node.label);
    recorder.check('data/concept-labels-unique', new Set(labels).size === labels.length, `${new Set(labels).size}/${labels.length}`);
  } finally {
    await context.close();
  }

  await browser.close();
  const failed = recorder.checks.filter((entry) => !entry.ok);
  writeResult(AREA, { base: BASE, details, checks: recorder.checks, failedChecks: failed });
  printSummary('content', recorder);
}

// 先声明浏览器引用，main 里赋值（避免顶层 await + 变量顺序问题）
let browserRef = null;
ensureDirs();
const browser = await launchBrowser();
browserRef = browser;
main().catch(async (error) => {
  console.error(error);
  process.exitCode = 1;
  try {
    await browser?.close();
  } catch {
    /* 忽略 */
  }
});
