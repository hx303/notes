import { readLearningPathDefinition } from "../util/learningPath";
import { FullSlug, resolveRelative } from "../util/path";
import { QuartzComponent, QuartzComponentConstructor } from "./types";
import style from "./styles/pathIndex.scss";

const statusLabel: Record<string, string> = {
  published: "已发布",
  draft: "建设中",
  archived: "已归档",
};

const PathIndex: QuartzComponent = ({ fileData, allFiles }) => {
  const paths = allFiles
    .filter((file) => file.slug && /^paths\/[^/]+\/index$/.test(file.slug))
    .map((file) => ({
      file,
      definition: readLearningPathDefinition(file.frontmatter?.learningPath),
    }))
    .filter((item) => item.definition)
    .sort((a, b) => {
      const aPublished = a.definition!.status === "published" ? 0 : 1;
      const bPublished = b.definition!.status === "published" ? 0 : 1;
      return (
        aPublished - bPublished ||
        String(a.file.frontmatter?.title).localeCompare(
          String(b.file.frontmatter?.title),
          "zh-CN",
        )
      );
    });

  return (
    <div class="path-index" data-path-index>
      <header class="path-index-intro">
        <p class="path-index-kicker">CURATED PATHS / 公开学习路径</p>
        <h2>按意图前进，而不是按文件夹徘徊</h2>
        <p>
          每条路径都由作者说明目标、前置知识、顺序、分支和维护状态。选择一条适合现在的路径，再回到文章继续建立自己的知识库。
        </p>
      </header>
      <ol class="path-index-list">
        {paths.map(({ file, definition }) => (
          <li data-path-status={definition!.status}>
            <div class="path-index-status">
              {statusLabel[definition!.status]}
            </div>
            <div>
              <h3>
                <a
                  class="internal"
                  href={resolveRelative(fileData.slug!, file.slug as FullSlug)}
                >
                  {file.frontmatter?.title ?? "未命名路径"}
                </a>
              </h3>
              <p>{definition!.outcome}</p>
              <dl>
                <div>
                  <dt>主线节点</dt>
                  <dd>{definition!.steps.length}</dd>
                </div>
                <div>
                  <dt>预计用时</dt>
                  <dd>{definition!.estimatedTime}</dd>
                </div>
                <div>
                  <dt>适合</dt>
                  <dd>{definition!.audience[0]}</dd>
                </div>
              </dl>
            </div>
          </li>
        ))}
      </ol>
      {paths.length === 0 && (
        <p class="path-index-empty">首批路径正在策划中。</p>
      )}
    </div>
  );
};

PathIndex.css = style;

export default (() => PathIndex) satisfies QuartzComponentConstructor;
