import assert from "node:assert";
import test from "node:test";
import { render } from "preact-render-to-string";
import type { FullSlug } from "../util/path";
import type { QuartzPluginData } from "../plugins/vfile";
import RecentGrowthConstructor from "./RecentGrowth";
import type { QuartzComponentProps } from "./types";

const file = (
  slug: string,
  title: string,
  created: string,
  modified: string,
): QuartzPluginData =>
  ({
    slug: slug as FullSlug,
    frontmatter: { title },
    links: [],
    dates: {
      created: new Date(created),
      modified: new Date(modified),
      published: new Date(created),
    },
  }) as QuartzPluginData;

test("D09 recent growth exposes monthly records, change labels and filters", () => {
  const files = [
    file("notes/new", "新记录", "2026-07-01", "2026-07-01"),
    file("notes/revised", "实质修订", "2026-06-01", "2026-07-10"),
    file("notes/polish", "小修", "2026-07-01", "2026-07-02"),
  ];
  const props = {
    fileData: files[0],
    allFiles: files,
    cfg: { locale: "zh-CN" },
  } as unknown as QuartzComponentProps;
  const RecentGrowth = RecentGrowthConstructor();
  const html = render(<RecentGrowth {...props} />);
  assert.match(html, /data-recent-growth/);
  assert.match(html, /新记录/);
  assert.match(html, /实质修订/);
  assert.match(html, /小修/);
  assert.strictEqual((html.match(/<select/g) ?? []).length, 3);
});
