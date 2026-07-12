import matter from "gray-matter"
import remarkFrontmatter from "remark-frontmatter"
import { QuartzTransformerPlugin } from "../types"
import yaml from "js-yaml"
import toml from "toml"
import { FilePath, FullSlug, getFileExtension, slugifyFilePath, slugTag } from "../../util/path"
import { QuartzPluginData } from "../vfile"
import { i18n } from "../../i18n"
import {
  actionableKnowledgeIssues,
  formatKnowledgeIssue,
  normalizeKnowledgeMetadata,
} from "../../util/knowledgeMetadata"
import type {
  KnowledgeMaturity,
  KnowledgeMetadata,
  KnowledgeMetadataIssue,
  KnowledgeRelation,
  KnowledgeSource,
  KnowledgeTopic,
  KnowledgeType,
} from "../../util/knowledgeMetadata"
import { styleText } from "util"

export interface Options {
  delimiters: string | [string, string]
  language: "yaml" | "toml"
}

const defaultOptions: Options = {
  delimiters: "---",
  language: "yaml",
}

function coalesceAliases(data: { [key: string]: any }, aliases: string[]) {
  for (const alias of aliases) {
    if (data[alias] !== undefined && data[alias] !== null) return data[alias]
  }
}

function coerceToArray(input: string | string[]): string[] | undefined {
  if (input === undefined || input === null) return undefined

  // coerce to array
  if (!Array.isArray(input)) {
    input = input
      .toString()
      .split(",")
      .map((tag: string) => tag.trim())
  }

  // remove all non-strings
  return input
    .filter((tag: unknown) => typeof tag === "string" || typeof tag === "number")
    .map((tag: string | number) => tag.toString())
}

function getAliasSlugs(aliases: string[]): FullSlug[] {
  const res: FullSlug[] = []
  for (const alias of aliases) {
    const isMd = getFileExtension(alias) === "md"
    const mockFp = isMd ? alias : alias + ".md"
    const slug = slugifyFilePath(mockFp as FilePath)
    res.push(slug)
  }

  return res
}

export const FrontMatter: QuartzTransformerPlugin<Partial<Options>> = (userOpts) => {
  const opts = { ...defaultOptions, ...userOpts }
  return {
    name: "FrontMatter",
    markdownPlugins(ctx) {
      const { cfg, allSlugs } = ctx
      return [
        [remarkFrontmatter, ["yaml", "toml"]],
        () => {
          return (_, file) => {
            const sourceSlug = file.data.slug!
            const fileData = Buffer.from(file.value as Uint8Array)
            const { data } = matter(fileData, {
              ...opts,
              engines: {
                yaml: (s) => yaml.load(s, { schema: yaml.JSON_SCHEMA }) as object,
                toml: (s) => toml.parse(s) as object,
              },
            })

            file.data.sourceSlug = sourceSlug
            const canonicalSlug = ctx.canonicalSlugMap[sourceSlug]
            if (canonicalSlug) {
              data.canonicalSlug = canonicalSlug
              file.data.slug = canonicalSlug
            }

            if (data.title != null && data.title.toString() !== "") {
              data.title = data.title.toString()
            } else {
              data.title = file.stem ?? i18n(cfg.configuration.locale).propertyDefaults.title
            }

            const tags = coerceToArray(coalesceAliases(data, ["tags", "tag"]))
            if (tags) data.tags = [...new Set(tags.map((tag: string) => slugTag(tag)))]

            const aliases = coerceToArray(coalesceAliases(data, ["aliases", "alias"]))
            const aliasSlugs = aliases ? getAliasSlugs(aliases) : []
            if (canonicalSlug && canonicalSlug !== sourceSlug) {
              aliasSlugs.push(sourceSlug)
            }
            if (aliases) {
              data.aliases = aliases // frontmatter
            }
            file.data.aliases = [...new Set(aliasSlugs)]
            allSlugs.push(...file.data.aliases)

            const commentKey = coalesceAliases(data, ["commentKey", "comment_key"])
            if (commentKey !== undefined && commentKey !== null && commentKey.toString() !== "") {
              data.commentKey = commentKey.toString()
            }
            file.data.commentKey =
              data.commentKey?.toString() ?? file.data.filePath?.toString() ?? sourceSlug

            if (data.permalink != null && data.permalink.toString() !== "") {
              data.permalink = data.permalink.toString() as FullSlug
              const aliases = file.data.aliases ?? []
              aliases.push(data.permalink)
              file.data.aliases = aliases
              allSlugs.push(data.permalink)
            }

            const cssclasses = coerceToArray(coalesceAliases(data, ["cssclasses", "cssclass"]))
            if (cssclasses) data.cssclasses = cssclasses

            const socialImage = coalesceAliases(data, ["socialImage", "image", "cover"])

            const created = coalesceAliases(data, ["created", "date"])
            if (created) {
              data.created = created
            }

            const modified = coalesceAliases(data, [
              "modified",
              "lastmod",
              "updated",
              "last-modified",
            ])
            if (modified) data.modified = modified
            data.modified ||= created // if modified is not set, use created

            const published = coalesceAliases(data, ["published", "publishDate", "date"])
            if (published) data.published = published

            if (socialImage) data.socialImage = socialImage

            const normalizedKnowledge = normalizeKnowledgeMetadata(data, {
              sourceSlug,
              commentKey: file.data.commentKey ?? file.data.filePath?.toString() ?? sourceSlug,
            })
            file.data.knowledgeMetadata = normalizedKnowledge.metadata
            file.data.knowledgeMetadataIssues = normalizedKnowledge.issues
            for (const issue of actionableKnowledgeIssues(
              normalizedKnowledge.metadata,
              normalizedKnowledge.issues,
            )) {
              console.warn(styleText("yellow", formatKnowledgeIssue(sourceSlug, issue)))
            }

            // Remove duplicate slugs
            const uniqueSlugs = [...new Set(allSlugs)]
            allSlugs.splice(0, allSlugs.length, ...uniqueSlugs)

            // fill in frontmatter
            file.data.frontmatter = data as QuartzPluginData["frontmatter"]
          }
        },
      ]
    },
  }
}

declare module "vfile" {
  interface DataMap {
    aliases: FullSlug[]
    frontmatter: { [key: string]: unknown } & {
      title: string
    } & Partial<{
        tags: string[]
        aliases: string[]
        modified: string
        created: string
        published: string
        description: string
        socialDescription: string
        publish: boolean | string
        draft: boolean | string
        lang: string
        enableToc: string
        cssclasses: string[]
        socialImage: string
        comments: boolean | string
        canonicalSlug: string
        commentKey: string
        summary: string
        primaryTopic: KnowledgeTopic
        topics: KnowledgeTopic[]
        type: KnowledgeType
        maturity: KnowledgeMaturity
        updated: string
        prerequisites: string[]
        related: KnowledgeRelation[]
        sources: KnowledgeSource[]
        license: string
      }>
    sourceSlug: FullSlug
    commentKey: string
    knowledgeMetadata: KnowledgeMetadata
    knowledgeMetadataIssues: KnowledgeMetadataIssue[]
  }
}
