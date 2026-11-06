import { ButtonLink } from '../components/Button';
import { Icon } from '../components/Icon';
import { hrefFor, labHref } from '../lib/router';

export interface NotFoundPageProps {
  title?: string;
  description?: string;
  /** 访问不到的路径，仅用于展示 */
  path?: string;
}

/** 应用内 404：保留外壳，给出回首页 / 实验室的出口。 */
export function NotFoundPage({
  title = '这段代码没有对应的页面。',
  description = '你访问的地址可能已经移动，或者链接拼写有误。检查一下地址，或从下面重新出发。',
  path,
}: NotFoundPageProps) {
  return (
    <div className="page notfound-page">
      <div className="notfound__art" aria-hidden="true">
        <span className="notfound__code">404</span>
        <span className="notfound__dot notfound__dot--amber" />
        <span className="notfound__dot notfound__dot--teal" />
        <span className="notfound__dot notfound__dot--rose" />
      </div>

      <span className="eyebrow notfound__eyebrow">
        <span className="eyebrow__dot" aria-hidden="true" />
        ROUTE NOT FOUND
      </span>
      <h1 className="notfound__title">{title}</h1>
      <p className="notfound__description">{description}</p>

      <p className="notfound__terminal mono">
        <span className="notfound__prompt">$</span> codeviz open {path ?? '/'} → <span className="notfound__result">404 not found</span>
      </p>

      <div className="notfound__actions">
        <ButtonLink href={hrefFor('/')} variant="primary" icon="home">
          返回首页
        </ButtonLink>
        <ButtonLink href={labHref()} variant="secondary" icon="flask">
          打开代码实验室
        </ButtonLink>
      </div>

      <p className="notfound__hint">
        <Icon name="map" size={14} />
        也可以从侧栏进入教程、知识图谱或关于页。
      </p>
    </div>
  );
}
