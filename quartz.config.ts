import { QuartzConfig } from "./quartz/cfg"
import * as Plugin from "./quartz/plugins"

const config: QuartzConfig = {
  configuration: {
    pageTitle: "📝 夔嵬的笔记",
    pageTitleSuffix: "",
    enableSPA: true,
    enablePopovers: true,
    analytics: null,
    locale: "zh-CN",
    baseUrl: "wouldkeep.com",
    ignorePatterns: ["private", "templates", ".obsidian", "_backup", "_backups"],
    defaultDateType: "created",
    theme: {
      fontOrigin: "local",
      cdnCaching: true,
      typography: {
        header: "Noto Serif SC",
        body: "Noto Sans SC",
        code: "JetBrains Mono",
      },
      colors: {
        lightMode: {
          light: "#fdf6ee",
          lightgray: "#e8ddd0",
          gray: "#c4b9a8",
          darkgray: "#5c5349",
          dark: "#2c2416",
          secondary: "#8b4513",
          tertiary: "#5a7d63",
          highlight: "rgba(139, 69, 19, 0.1)",
          textHighlight: "#f5d67688",
        },
        darkMode: {
          light: "#1a1814",
          lightgray: "#2d2a24",
          gray: "#5c5548",
          darkgray: "#c4b9a8",
          dark: "#f0e8d8",
          secondary: "#c9a96e",
          tertiary: "#7dad8a",
          highlight: "rgba(201, 169, 110, 0.12)",
          textHighlight: "#8b691488",
        },
      },
    },
  },
  plugins: {
    transformers: [
      Plugin.FrontMatter(),
      Plugin.CreatedModifiedDate({
        priority: ["frontmatter", "git", "filesystem"],
      }),
      Plugin.SyntaxHighlighting({
        theme: {
          light: "github-light",
          dark: "github-dark",
        },
        keepBackground: false,
      }),
      Plugin.ObsidianFlavoredMarkdown({ enableInHtmlEmbed: true }),
      Plugin.GitHubFlavoredMarkdown(),
      Plugin.TableOfContents(),
      Plugin.CrawlLinks({ markdownLinkResolution: "shortest" }),
      Plugin.Description(),
      Plugin.Latex({ renderEngine: "katex" }),
    ],
    filters: [Plugin.RemoveDrafts()],
    emitters: [
      Plugin.AliasRedirects(),
      Plugin.ComponentResources(),
      Plugin.ContentPage(),
      Plugin.FolderPage(),
      Plugin.TagPage(),
      Plugin.ContentIndex({
        enableSiteMap: true,
        enableRSS: true,
      }),
      Plugin.Assets(),
      Plugin.Static(),
      Plugin.Favicon(),
      Plugin.NotFoundPage(),
    ],
  },
}

export default config
