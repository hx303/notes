// @ts-ignore
import script from "./scripts/supabase-comments.inline"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { classNames } from "../util/lang"

type Options = {
  /** Supabase project URL */
  supabaseUrl: string
  /** Supabase anon key */
  supabaseAnonKey: string
}

export default ((opts: Options) => {
  const SupabaseComments: QuartzComponent = ({ displayClass, fileData }: QuartzComponentProps) => {
    // Check for comments: false in frontmatter
    const disableComment: boolean =
      typeof fileData.frontmatter?.comments !== "undefined" &&
      (!fileData.frontmatter?.comments || fileData.frontmatter?.comments === "false")
    if (disableComment) {
      return <></>
    }

    // filePath: full content path, e.g. "content/课堂笔记/有机化学/15.md"
    const filePath = fileData.filePath ?? ""

    return (
      <div
        class={classNames(displayClass, "supabase-comments")}
        data-file-path={filePath}
        data-supabase-url={opts.supabaseUrl}
        data-supabase-anon-key={opts.supabaseAnonKey}
      >
        <h3 style="margin-top:2rem">💬 评论</h3>
        <div class="supabase-comments-list" id="supabase-comments-list">
          <p style="color:#888;font-size:.9em">加载评论中...</p>
        </div>
      </div>
    )
  }

  SupabaseComments.afterDOMLoaded = script

  return SupabaseComments
}) satisfies QuartzComponentConstructor<Options>
