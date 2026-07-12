import assert from "node:assert";
import test, { describe } from "node:test";
import { render } from "preact-render-to-string";
import type { FullSlug } from "../util/path";
import type { QuartzPluginData } from "../plugins/vfile";
import PathIndexConstructor from "./PathIndex";
import type { QuartzComponentProps } from "./types";

const file = (
  slug: string,
  title: string,
  learningPath: Record<string, unknown>,
): QuartzPluginData =>
  ({
    slug: slug as FullSlug,
    frontmatter: { title, learningPath },
    links: [],
  }) as QuartzPluginData;

describe("D06 path index", () => {
  test("lists published paths with counts, time and audience", () => {
    const paths = [
      file("paths/physics/index", "物理路径", {
        id: "physics",
        status: "published",
        maintenance: "maintained",
        audience: ["物理学习者"],
        outcome: "理解光学。",
        estimatedTime: "4 小时",
        steps: [
          {
            id: "one",
            slug: "notes/one",
            purpose: "起点",
            outcome: "继续",
            duration: "1 小时",
          },
        ],
      }),
      file("paths/draft/index", "建设中路径", {
        id: "draft",
        status: "draft",
        maintenance: "review-needed",
        audience: ["研究者"],
        outcome: "还在整理。",
        estimatedTime: "待定",
        steps: [
          {
            id: "one",
            slug: "notes/one",
            purpose: "起点",
            outcome: "继续",
            duration: "待定",
          },
        ],
      }),
    ];
    const PathIndex = PathIndexConstructor();
    const componentProps = {
      fileData: paths[0],
      allFiles: paths,
      cfg: { locale: "zh-CN" },
    } as unknown as QuartzComponentProps;
    const html = render(<PathIndex {...componentProps} />);

    assert.match(html, /data-path-index/);
    assert.match(html, /物理路径/);
    assert.match(html, /建设中路径/);
    assert.match(html, /主线节点/);
    assert.match(html, /物理学习者/);
    assert.strictEqual((html.match(/data-path-status=/g) ?? []).length, 2);
  });
});
