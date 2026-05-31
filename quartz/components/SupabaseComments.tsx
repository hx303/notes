// @ts-ignore
import script from "./scripts/supabase-comments.inline"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { classNames } from "../util/lang"

type Options = {
  supabaseUrl: string
  supabaseAnonKey: string
}

export default ((opts: Options) => {
  const SupabaseComments: QuartzComponent = ({ displayClass, fileData }: QuartzComponentProps) => {
    const disableComment: boolean =
      typeof fileData.frontmatter?.comments !== "undefined" &&
      (!fileData.frontmatter?.comments || fileData.frontmatter?.comments === "false")
    if (disableComment) return <></>

    const filePath = fileData.filePath ?? ""

    return (
      <div
        class={classNames(displayClass, "supabase-comments")}
        data-file-path={filePath}
        data-supabase-url={opts.supabaseUrl}
        data-supabase-anon-key={opts.supabaseAnonKey}
      ></div>
    )
  }

  SupabaseComments.afterDOMLoaded = script

  return SupabaseComments
}) satisfies QuartzComponentConstructor<Options>
