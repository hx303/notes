import { PageLayout, SharedLayout } from "./quartz/cfg"
import * as Component from "./quartz/components"

export const sharedPageComponents: SharedLayout = {
  head: Component.Head(),
  header: [],
  afterBody: [],
  footer: Component.Footer({
    links: {
      "🌐 GitHub": "https://github.com/wld030303/notes",
      "✍️ 由 Quartz 驱动": "https://quartz.jzhao.xyz",
    },
  }),
}

export const defaultContentPageLayout: PageLayout = {
  beforeBody: [
    Component.ConditionalRender({
      component: Component.Breadcrumbs(),
      condition: (page) => page.fileData.slug !== "index",
    }),
    Component.ArticleTitle(),
    Component.ContentMeta(),
    Component.TagList(),
  ],
  left: [
    Component.PageTitle(),
    Component.MobileOnly(Component.Spacer()),
    Component.Flex({
      components: [
        {
          Component: Component.Search(),
          grow: true,
        },
        { Component: Component.Darkmode() },
        { Component: Component.ReaderMode() },
      ],
    }),
    Component.Explorer({
      filterFn: (node) => {
        if (node.slugSegment === "tags") return false
        if (node.displayName === "attachments") return false
        if (node.displayName.endsWith("_图片")) return false
        return true
      },
    }),
  ],
  right: [
    Component.DesktopOnly(Component.TableOfContents()),
    Component.Backlinks(),
    Component.Graph(),
  ],
}

export const defaultListPageLayout: PageLayout = {
  beforeBody: [
    Component.Breadcrumbs(),
    Component.ArticleTitle(),
    Component.ContentMeta(),
  ],
  left: [
    Component.PageTitle(),
    Component.MobileOnly(Component.Spacer()),
    Component.Flex({
      components: [
        {
          Component: Component.Search(),
          grow: true,
        },
        { Component: Component.Darkmode() },
      ],
    }),
    Component.Explorer({
      filterFn: (node) => {
        if (node.slugSegment === "tags") return false
        if (node.displayName === "attachments") return false
        if (node.displayName.endsWith("_图片")) return false
        return true
      },
    }),
  ],
  right: [
    Component.RecentNotes({
      title: "🕐 最近更新",
      limit: 8,
      showTags: false,
    }),
  ],
}
