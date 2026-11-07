import { PageHeader } from '../layout/PageHeader';
import { SiteFooter } from '../layout/Footer';
import { Badge } from '../components/Badge';
import { ButtonLink } from '../components/Button';
import { Icon, type IconName } from '../components/Icon';
import { hrefFor, labHref, lessonHref } from '../lib/router';
import { MAX_CODE_LINES } from '../../engine/types';
import { lessons } from '../../data';
import { COVERAGE_LABEL, COVERAGE_ROWS, COVERAGE_SUMMARY } from '../../data/coverage';

const LESSON_TITLE = new Map(lessons.map((lesson) => [lesson.id, lesson.title]));

const COVERAGE_TONE = {
  covered: 'teal',
  partial: 'amber',
  gap: 'rose',
} as const;

const CAN_DO = [
  `把 ${MAX_CODE_LINES} 行以内的 C/C++ 代码解析成流程图、调用图、类图、内存布局与结构大纲。`,
  '用教学子集解释器逐句执行常见语法，展示变量变化、调用栈与程序输出。',
  `通过 ${lessons.length} 节原创课程、随堂测验与知识图谱，把零散概念连成一条路径。`,
  '深色模式、键盘操作与本地进度记录，所有数据只留在你的浏览器里。',
];

const CANNOT_DO = [
  '不是编译器：不会生成可执行文件，也不做完整的语义分析与优化。',
  '不执行文件 I/O、系统调用与第三方库；网络请求在运行时被禁止。',
  '单步解释器只覆盖教学子集：模板、lambda、多继承、STL 容器等会给出明确说明，不会假装能跑。',
  '不替代真实调试器、静态分析工具与单元测试。',
];

const TECH_ITEMS: Array<{ icon: IconName; title: string; body: string }> = [
  {
    icon: 'code',
    title: '纯前端应用',
    body: 'Vite + React + TypeScript 构建，没有后端服务，也没有运行时网络请求。',
  },
  {
    icon: 'flow',
    title: '本地分析引擎',
    body: '自研容错解析器与教学子集解释器，同步纯函数，相同输入得到相同结果。',
  },
  {
    icon: 'memory',
    title: '数据不出浏览器',
    body: '代码只在内存中分析；学习进度、测验答案与实验室草稿存放在 localStorage。',
  },
  {
    icon: 'sparkle',
    title: '手写可视化',
    body: '流程图、调用图、类图与内存图全部由手写 SVG 绘制，未引入图表库。',
  },
];

const SHORTCUTS: Array<{ keys: string[]; action: string; scope: string }> = [
  { keys: ['Ctrl', 'Enter'], action: '分析当前代码', scope: '代码实验室' },
  { keys: ['Ctrl', 'Shift', 'Enter'], action: '运行单步追踪', scope: '代码实验室' },
  { keys: ['Space'], action: '播放 / 暂停', scope: '播放器获得焦点时' },
  { keys: ['Esc'], action: '关闭弹窗或抽屉', scope: '任何对话框' },
];

export function AboutPage() {
  return (
    <div className="page about-page">
      <PageHeader
        eyebrow="ABOUT CODEVIZ"
        title="让抽象的代码结构，变成可以看见、可以触摸的东西。"
        description="CodeViz 是一个面向初学者的 C/C++ 图解工坊：课程、示例与代码分析都围绕同一件事——先看见结构，再理解语法。"
        actions={
          <div className="about-hero-actions">
            <ButtonLink href={hrefFor('/learn')} variant="primary" iconRight="arrow-right">
              浏览课程
            </ButtonLink>
            <ButtonLink href={labHref()} variant="secondary" icon="flask">
              打开实验室
            </ButtonLink>
          </div>
        }
      />

      <section className="about-section about-why" aria-labelledby="about-why-title">
        <div className="about-section__head">
          <span className="eyebrow">WHY VISUAL</span>
          <h2 className="about-section__title" id="about-why-title">
            为什么是图形化
          </h2>
        </div>
        <div className="about-why__grid">
          <div className="about-why__copy">
            <p>
              初学 C/C++ 时最难的往往不是关键字，而是想象不到程序正在做什么：条件走向哪里、函数如何层层返回、
              变量在内存中占着哪一格、指针指向谁。只看文本，这些关系很容易散落成一团。
            </p>
            <p>
              图形把隐含的结构显式地摆出来。你可以先在流程图里看清分支，再回到代码逐行对照；也可以在单步执行里
              观察一次循环如何改变变量。理解因此有了可以停靠的锚点。
            </p>
          </div>
          <div className="about-why__principles">
            <div className="about-principle">
              <span className="about-principle__num mono">01</span>
              <div>
                <h3>先结构，后细节</h3>
                <p>先看到整体走向，再读具体的语句与类型。</p>
              </div>
            </div>
            <div className="about-principle">
              <span className="about-principle__num mono">02</span>
              <div>
                <h3>同一份代码，多种视角</h3>
                <p>流程、调用、对象、内存互相印证，不必换工具。</p>
              </div>
            </div>
            <div className="about-principle">
              <span className="about-principle__num mono">03</span>
              <div>
                <h3>动手比记住更重要</h3>
                <p>在实验室改一改代码，再观察图怎样变化。</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="about-section" aria-labelledby="about-scope-title">
        <div className="about-section__head">
          <span className="eyebrow">SCOPE</span>
          <h2 className="about-section__title" id="about-scope-title">
            它能做什么，不支持什么
          </h2>
        </div>
        <div className="about-scope">
          <div className="about-scope__column about-scope__column--yes">
            <h3 className="about-scope__title">
              <span className="about-scope__mark" aria-hidden="true">
                <Icon name="check" size={15} />
              </span>
              可以做到
            </h3>
            <ul>
              {CAN_DO.map((item) => (
                <li key={item}>
                  <Icon name="check" size={14} />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="about-scope__column about-scope__column--no">
            <h3 className="about-scope__title">
              <span className="about-scope__mark" aria-hidden="true">
                <Icon name="info" size={15} />
              </span>
              有明确边界
            </h3>
            <ul>
              {CANNOT_DO.map((item) => (
                <li key={item}>
                  <Icon name="close" size={13} />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="about-section" aria-labelledby="about-tech-title">
        <div className="about-section__head">
          <span className="eyebrow">UNDER THE HOOD</span>
          <h2 className="about-section__title" id="about-tech-title">
            技术说明
          </h2>
        </div>
        <ul className="about-tech">
          {TECH_ITEMS.map((item) => (
            <li className="about-tech__card" key={item.title}>
              <span className="about-tech__icon" aria-hidden="true">
                <Icon name={item.icon} size={19} />
              </span>
              <h3 className="about-tech__title">{item.title}</h3>
              <p className="about-tech__body">{item.body}</p>
            </li>
          ))}
        </ul>
        <div className="about-deps">
          <Badge tone="indigo" mono>
            构建依赖
          </Badge>
          <p>CodeMirror 6 · React · Vite · TypeScript；无图表库、无外部 CDN、无运行时网络请求。</p>
        </div>
      </section>


      <section className="about-section" aria-labelledby="about-coverage-title">
        <div className="about-section__head">
          <span className="eyebrow">COVERAGE</span>
          <h2 className="about-section__title" id="about-coverage-title">
            知识点覆盖矩阵
          </h2>
        </div>
        <p className="about-section__lead">
          下表把两本参考教材的章节逐条对到课程上。没有完全覆盖的部分会直接写出来——比起"什么都教了"，知道自己缺什么更重要。
        </p>
        <div className="coverage-summary" role="list">
          <span className="coverage-summary__item coverage-summary__item--covered" role="listitem">
            已覆盖 <strong className="tabular">{COVERAGE_SUMMARY.covered}</strong>
          </span>
          <span className="coverage-summary__item coverage-summary__item--partial" role="listitem">
            部分覆盖 <strong className="tabular">{COVERAGE_SUMMARY.partial}</strong>
          </span>
          <span className="coverage-summary__item coverage-summary__item--gap" role="listitem">
            未覆盖 <strong className="tabular">{COVERAGE_SUMMARY.gap}</strong>
          </span>
          <span className="coverage-summary__total tabular">共 {COVERAGE_SUMMARY.total} 个知识点</span>
        </div>
        <div className="table-wrap">
          <table className="coverage-table">
            <thead>
              <tr>
                <th scope="col">来源</th>
                <th scope="col">教材知识点</th>
                <th scope="col">状态</th>
                <th scope="col">对应课程</th>
                <th scope="col">说明</th>
              </tr>
            </thead>
            <tbody>
              {COVERAGE_ROWS.map((row) => (
                <tr key={`${row.source}-${row.topic}`}>
                  <td className="coverage-table__source">
                    {row.source === 'C 程序设计教程' ? 'C' : 'C++'}
                  </td>
                  <td>{row.topic}</td>
                  <td>
                    <Badge tone={COVERAGE_TONE[row.status]}>{COVERAGE_LABEL[row.status]}</Badge>
                  </td>
                  <td>
                    {row.lessonIds.length === 0 ? (
                      <span className="muted">—</span>
                    ) : (
                      <span className="coverage-table__lessons">
                        {row.lessonIds.map((id) => (
                          <a className="coverage-table__link mono" key={id} href={lessonHref(id)}>
                            {LESSON_TITLE.get(id)?.split('：')[0] ?? id}
                          </a>
                        ))}
                      </span>
                    )}
                  </td>
                  <td className="muted">{row.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="about-section" aria-labelledby="about-refs-title">
        <div className="about-section__head">
          <span className="eyebrow">REFERENCES</span>
          <h2 className="about-section__title" id="about-refs-title">
            参考教材
          </h2>
        </div>
        <div className="about-refs">
          <article className="about-ref">
            <span className="about-ref__icon" aria-hidden="true">
              <Icon name="book" size={20} />
            </span>
            <div>
              <h3 className="about-ref__title">《C程序设计教程（第3版）》</h3>
              <p className="about-ref__meta">谭浩强 · 清华大学出版社</p>
              <p className="about-ref__desc">作为 C 语言部分的课程脉络参考：从顺序结构到数组、函数、指针与文件。</p>
            </div>
          </article>
          <article className="about-ref">
            <span className="about-ref__icon" aria-hidden="true">
              <Icon name="book" size={20} />
            </span>
            <div>
              <h3 className="about-ref__title">《C++自学视频教程》</h3>
              <p className="about-ref__meta">软件开发技术联盟 编著 · 清华大学出版社</p>
              <p className="about-ref__desc">作为 C++ 面向对象部分的参考：类与对象、继承、多态、模板与 STL。</p>
            </div>
          </article>
        </div>
        <div className="about-original">
          <Icon name="lightbulb" size={17} />
          <p>
            <strong>原创声明：</strong>
            课程讲解、示例代码与图表均为 CodeViz 原创；教材仅作知识顺序参考，未复制教材原文、例题或插图。
          </p>
        </div>
      </section>

      <section className="about-section" aria-labelledby="about-keys-title">
        <div className="about-section__head">
          <span className="eyebrow">SHORTCUTS</span>
          <h2 className="about-section__title" id="about-keys-title">
            快捷键
          </h2>
        </div>
        <div className="about-keys">
          <table className="about-keys__table">
            <thead>
              <tr>
                <th scope="col">按键</th>
                <th scope="col">动作</th>
                <th scope="col">适用位置</th>
              </tr>
            </thead>
            <tbody>
              {SHORTCUTS.map((item) => (
                <tr key={item.action}>
                  <td>
                    <span className="about-keys__combo">
                      {item.keys.map((key, index) => (
                        <span key={key}>
                          {index > 0 ? <span className="about-keys__plus">+</span> : null}
                          <kbd>{key}</kbd>
                        </span>
                      ))}
                    </span>
                  </td>
                  <td>{item.action}</td>
                  <td className="muted">{item.scope}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="about-keys__note">
            macOS 上 Ctrl 对应 Command（⌘）。所有交互元素都可以用 Tab 聚焦，Enter 或空格触发。
          </p>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
