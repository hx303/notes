import readingTime from "reading-time"
import { JSX } from "preact"
import { Date, getDate } from "./Date"
import { i18n } from "../i18n"
import { classNames } from "../util/lang"
import { QuartzComponentConstructor, QuartzComponentProps } from "./types"
import style from "./styles/contentMeta.scss"

interface ContentMetaOptions {
  showReadingTime: boolean
  showComma: boolean
}

const defaultOptions: ContentMetaOptions = {
  showReadingTime: true,
  showComma: true,
}

export default ((opts?: Partial<ContentMetaOptions>) => {
  const options: ContentMetaOptions = { ...defaultOptions, ...opts }

  function ContentMetadata({ cfg, fileData, displayClass }: QuartzComponentProps) {
    if (fileData.knowledgeMetadata?.isStructured || !fileData.text) return null

    const segments: (string | JSX.Element)[] = []
    if (fileData.dates) {
      segments.push(
        <span>
          <Date date={getDate(cfg, fileData)!} locale={cfg.locale} />
        </span>,
      )
    }

    if (options.showReadingTime) {
      const displayedTime = i18n(cfg.locale).components.contentMeta.readingTime({
        minutes: Math.ceil(readingTime(fileData.text).minutes),
      })
      segments.push(<span>{displayedTime}</span>)
    }

    return (
      <p show-comma={options.showComma} class={classNames(displayClass, "content-meta")}>
        {segments}
      </p>
    )
  }

  ContentMetadata.css = style
  return ContentMetadata
}) satisfies QuartzComponentConstructor
