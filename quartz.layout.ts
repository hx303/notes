import { PageLayout, SharedLayout } from "./quartz/cfg";
import * as Component from "./quartz/components";

export const sharedPageComponents: SharedLayout = {
  head: Component.Head(),
  header: [Component.Masthead(), Component.PrimaryNav(), Component.Search()],
  afterBody: [
    Component.RevisionHistory(),
    Component.CitationActions(),
    Component.RelatedKnowledge(),
    Component.CorrectionAction(),
    Component.SupabaseComments({
      supabaseUrl: "https://agocyybolrisqujvjqdj.supabase.co",
      supabaseAnonKey: "sb_publishable_9gb7jev7Ytwa6xQC75_ShQ_z3TJ6IZc",
    }),
    Component.BackToTop(),
    Component.MobileReadingTools(),
  ],
  footer: Component.Footer({
    links: {
      GitHub: "https://github.com/hx303/notes",
      Quartz: "https://quartz.jzhao.xyz",
    },
  }),
};

export const defaultContentPageLayout: PageLayout = {
  beforeBody: [
    Component.ConditionalRender({
      component: Component.Breadcrumbs(),
      condition: (page) => page.fileData.slug !== "index",
    }),
    Component.ArticleTitle(),
    Component.KnowledgeMeta(),
    Component.ContentMeta(),
    Component.TagList(),
    Component.PrerequisiteBlock(),
    Component.TableOfContents({ display: "inline" }),
  ],
  left: [
    Component.ReadingTools(),
    Component.DesktopOnly(
      Component.Explorer({
        title: "知识目录",
        folderDefaultState: "collapsed",
      }),
    ),
  ],
  right: [
    Component.DesktopOnly(Component.TableOfContents()),
    Component.Backlinks(),
  ],
};

export const defaultListPageLayout: PageLayout = {
  beforeBody: [
    Component.Breadcrumbs(),
    Component.ArticleTitle(),
    Component.ContentMeta(),
  ],
  left: [
    Component.ReadingTools(),
    Component.DesktopOnly(
      Component.Explorer({
        title: "知识目录",
        folderDefaultState: "collapsed",
      }),
    ),
  ],
  right: [
    Component.RecentNotes({
      title: "🕐 最近更新",
      limit: 8,
      showTags: false,
    }),
  ],
};
