import { classNames } from "../util/lang"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import style from "./styles/participation.scss"

const CorrectionAction: QuartzComponent = ({ displayClass, fileData }: QuartzComponentProps) => {
  const commentsDisabled =
    typeof fileData.frontmatter?.comments !== "undefined" &&
    (!fileData.frontmatter?.comments || fileData.frontmatter?.comments === "false")
  if (commentsDisabled) return null

  return (
    <section
      class={classNames(displayClass, "correction-action", "participation-section")}
      aria-labelledby="correction-title"
    >
      <div class="correction-intro">
        <div>
          <p class="participation-eyebrow">CORRECTION</p>
          <h2 id="correction-title">发现需要修正的地方？</h2>
          <p>纠错会作为结构化建议提交，不会混入普通讨论。</p>
        </div>
        <details class="correction-disclosure">
          <summary>提交纠错建议</summary>
          <form class="participation-form correction-form" data-participation-form="correction">
            <div class="participation-form-grid correction-form-grid">
              <label>
                <span>问题类型</span>
                <select name="correction-type">
                  <option value="事实或计算">事实或计算</option>
                  <option value="引用或来源">引用或来源</option>
                  <option value="内容已过期">内容已过期</option>
                  <option value="表述不清">表述不清</option>
                  <option value="其他">其他</option>
                </select>
              </label>
              <label>
                <span>问题位置</span>
                <input
                  type="text"
                  name="location"
                  maxLength={160}
                  required
                  placeholder="例如：第 3.2 节第二个公式"
                  aria-describedby="correction-location-hint"
                />
              </label>
              <label class="participation-message-field">
                <span>问题与修改建议</span>
                <textarea
                  name="content"
                  rows={5}
                  minLength={10}
                  maxLength={2000}
                  required
                  aria-describedby="correction-hint correction-status"
                  placeholder="说明哪里有问题、依据是什么，以及建议怎样修改。"
                ></textarea>
              </label>
            </div>
            <p id="correction-location-hint" class="participation-hint">
              请写标题、小节、段落或公式位置，帮助作者快速核对。
            </p>
            <p id="correction-hint" class="participation-hint">
              最多 2000 字。提交失败或离线时，草稿会保存在当前浏览器。
            </p>
            <div class="participation-form-actions">
              <button type="submit" class="participation-submit">
                提交纠错
              </button>
              <p class="participation-auth-note">
                <span data-auth-copy>提交需要登录。</span>
                <a href="/account/" data-auth-link>
                  前往登录
                </a>
              </p>
            </div>
            <div
              id="correction-status"
              class="participation-status"
              role="status"
              aria-live="polite"
              aria-atomic="true"
            >
              <span data-status-message></span>
              <button type="button" data-retry-submit hidden>
                重试提交
              </button>
            </div>
          </form>
        </details>
      </div>
    </section>
  )
}

CorrectionAction.css = style
export default (() => CorrectionAction) satisfies QuartzComponentConstructor
